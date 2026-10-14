package fiscal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// ProtocolConsultResult is fiscal.document.protocol_result.v1 from nfe-gateway.
type ProtocolConsultResult struct {
	DocumentID        *uuid.UUID             `json:"document_id"`
	Outcome           string                 `json:"outcome"`
	CStat             string                 `json:"cstat"`
	XMotivo           string                 `json:"x_motivo"`
	Protocol          string                 `json:"protocol"`
	AccessKey         string                 `json:"access_key"`
	ProtocolObjectKey string                 `json:"protocol_object_key"`
	ProtocolXMLBase64 string                 `json:"protocol_xml_base64"`
	ErrorMessage      string                 `json:"error_message"`
	Events            []ProtocolConsultEvent `json:"events"`
}

type ProtocolConsultEvent struct {
	EventKind         string `json:"event_kind"`
	TpEvento          string `json:"tp_evento"`
	ManifestationType string `json:"manifestation_type"`
	Protocol          string `json:"protocol"`
	NSeqEvento        string `json:"n_seq_evento"`
	Justification     string `json:"justification"`
	DhEvento          string `json:"dh_evento"`
	XMLBase64         string `json:"xml_base64"`
}

func ParseProtocolResult(payload []byte) (uuid.UUID, ProtocolConsultResult, error) {
	var envelope struct {
		OrganizationID uuid.UUID             `json:"organization_id"`
		Data           ProtocolConsultResult `json:"data"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return uuid.Nil, ProtocolConsultResult{}, err
	}
	return envelope.OrganizationID, envelope.Data, nil
}

// ApplyProtocolConsultResult persists protNFe + linked Dist-like events from ConsultaProtocolo.
// For status-consult stubs (and any outbound still waiting), it also advances
// business status so SAP polling sees authorized/rejected without a new POST.
func (s *Service) ApplyProtocolConsultResult(ctx context.Context, organizationID uuid.UUID, result ProtocolConsultResult) error {
	if result.DocumentID == nil {
		return nil
	}
	doc, err := s.GetDocument(ctx, organizationID, *result.DocumentID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		meta := map[string]any{
			"source":   "consulta_protocolo",
			"outcome":  result.Outcome,
			"cstat":    result.CStat,
			"x_motivo": result.XMotivo,
			"protocol": result.Protocol,
		}
		if result.ErrorMessage != "" {
			meta["error_message"] = result.ErrorMessage
		}
		metaBytes, _ := json.Marshal(meta)
		_, err := tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,'provider','nfe_gateway',$7,$8)
		`, ids.New(), organizationID, doc.ID, messaging.EventDocumentProtocolResult, doc.Status, doc.Status, metaBytes, now)
		if err != nil {
			return err
		}

		if result.Protocol != "" {
			_, _ = tx.Exec(ctx, `
				update organization_nfe
				set authorization_protocol = coalesce(nullif($3, ''), authorization_protocol),
				    authorized_at = coalesce(authorized_at, $4)
				where organization_document_id = $1 and organization_id = $2
			`, doc.ID, organizationID, result.Protocol, now)
		}

		objectKey := strings.TrimSpace(result.ProtocolObjectKey)
		if objectKey == "" && result.ProtocolXMLBase64 != "" {
			raw, decErr := base64.StdEncoding.DecodeString(result.ProtocolXMLBase64)
			if decErr != nil {
				return domainerr.Validation("invalid_protocol_xml", "protocol_xml_base64 is invalid")
			}
			originalKey, keyErr := originalPayloadObjectKeyTx(ctx, tx, doc.ID)
			if keyErr != nil || originalKey == "" {
				originalKey = "fiscal/" + organizationID.String() + "/" + doc.ID.String()
			}
			objectKey = originalKey + ".protocol.xml"
			if s.store != nil {
				if putErr := s.store.Put(ctx, objectKey, "application/xml", raw); putErr != nil {
					return putErr
				}
			}
		}
		if objectKey != "" {
			s.registerStoredPayload(ctx, tx, organizationID, doc.ID, PayloadProtocol, objectKey, "application/xml")
		}
		return nil
	})
	if err != nil {
		return err
	}

	toStatus, toProcessing, eventType, ok := statusesFromProtocolConsult(result)
	if !ok || IsTerminalStatus(doc.Status) {
		return nil
	}
	switch doc.Status {
	case StatusSubmitted, StatusReceived, StatusContingencyPending:
	default:
		return nil
	}
	meta := map[string]any{
		"source":   "consulta_protocolo",
		"outcome":  result.Outcome,
		"cstat":    result.CStat,
		"x_motivo": result.XMotivo,
		"protocol": result.Protocol,
	}
	if result.AccessKey != "" {
		meta["access_key"] = result.AccessKey
	}
	if result.ErrorMessage != "" {
		meta["error_message"] = result.ErrorMessage
	}
	if err := s.UpdateStatus(ctx, organizationID, doc.ID, doc.Status, toStatus, toProcessing, "provider", "nfe_gateway", eventType, meta); err != nil {
		if IsStaleStatusConflict(err) {
			return nil
		}
		return err
	}
	return nil
}

// HandleProtocolResult is the worker entry for protocol_result.v1.
func (w *Worker) HandleProtocolResult(ctx context.Context, payload []byte) error {
	organizationID, result, err := ParseProtocolResult(payload)
	if err != nil {
		return err
	}
	if err := w.docs.ApplyProtocolConsultResult(ctx, organizationID, result); err != nil {
		return err
	}
	if result.DocumentID == nil {
		return nil
	}
	for _, ev := range result.Events {
		_ = w.docs.AttachOutboundDistEvent(ctx, OutboundDistEventInput{
			OrganizationID:    organizationID,
			DocumentID:        *result.DocumentID,
			EventKind:         ev.EventKind,
			TpEvento:          ev.TpEvento,
			ManifestationType: ev.ManifestationType,
			Protocol:          ev.Protocol,
			NSeqEvento:        ev.NSeqEvento,
			Justification:     ev.Justification,
			DhEvento:          ev.DhEvento,
			Schema:            "consulta_protocolo",
			XMLBase64:         ev.XMLBase64,
		})
	}
	return nil
}
