package fiscal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

const (
	PayloadInutilizationRequest  = "inutilization_request"
	PayloadInutilizationResponse = "inutilization_response"
	PayloadManifestationEvent    = "manifestation_event"
)

// OutboundDistEventInput is posted by nfe-gateway after DistDFe classification.
type OutboundDistEventInput struct {
	OrganizationID    uuid.UUID
	DocumentID        uuid.UUID
	EventKind         string
	TpEvento          string
	ManifestationType string
	Protocol          string
	NSeqEvento        string
	Justification     string
	DhEvento          string
	Schema            string
	NSU               *int
	XMLObjectKey      string
	XMLBase64         string
}

// AttachOutboundDistEvent records a DistDFe event on an outbound NF-e
// (timeline + optional payload). Idempotent on protocol / tpEvento+nSeq.
func (s *Service) AttachOutboundDistEvent(ctx context.Context, in OutboundDistEventInput) error {
	doc, err := s.GetDocument(ctx, in.OrganizationID, in.DocumentID)
	if err != nil {
		return err
	}
	if !strings.EqualFold(doc.Direction, "outbound") || !strings.EqualFold(doc.DocumentType, "nfe") {
		return domainerr.Validation("not_outbound_nfe", "DistDFe outbound events only attach to outbound NF-e")
	}

	eventType := "manifestacao"
	switch strings.ToLower(strings.TrimSpace(in.EventKind)) {
	case "cancel":
		eventType = "fiscal.document.cancelled.v1"
	case "cce":
		eventType = "fiscal.document.correction_registered.v1"
	case "manifestation":
		eventType = "manifestacao"
	default:
		eventType = "fiscal.document.event_received.v1"
	}

	meta := map[string]any{
		"source":             "dist_dfe",
		"event_kind":         in.EventKind,
		"tp_evento":          in.TpEvento,
		"protocol":           in.Protocol,
		"n_seq_evento":       in.NSeqEvento,
		"schema":             in.Schema,
		"xml_object_key":     in.XMLObjectKey,
		"manifestation_type": in.ManifestationType,
	}
	if in.Justification != "" {
		meta["justification"] = in.Justification
	}
	if in.DhEvento != "" {
		meta["dh_evento"] = in.DhEvento
	}
	if in.NSU != nil {
		meta["nsu"] = *in.NSU
	}

	now := time.Now().UTC()
	return s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if exists, err := outboundEventAlreadyRecorded(ctx, tx, in.DocumentID, in.Protocol, in.TpEvento, in.NSeqEvento); err != nil {
			return err
		} else if exists {
			return nil
		}

		metaBytes, _ := json.Marshal(meta)
		_, err := tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,'provider','nfe_gateway',$7,$8)
		`, ids.New(), in.OrganizationID, in.DocumentID, eventType, doc.Status, doc.Status, metaBytes, now)
		if err != nil {
			return err
		}

		// Soft status sync when DistDFe confirms cancel/CC-e we may have missed.
		if strings.EqualFold(in.EventKind, "cancel") && strings.EqualFold(doc.Status, StatusAuthorized) {
			_, _ = tx.Exec(ctx, `
				update organization_documents
				set status = $3, processing_status = $4, completed_at = coalesce(completed_at, $5), updated_at = $5, version = version + 1
				where organization_id = $1 and id = $2 and status = $6
			`, in.OrganizationID, in.DocumentID, StatusCancelled, ProcessingCompleted, now, StatusAuthorized)
		}
		if strings.EqualFold(in.EventKind, "cce") && strings.EqualFold(doc.Status, StatusAuthorized) {
			_, _ = tx.Exec(ctx, `
				update organization_documents
				set status = $3, processing_status = $4, updated_at = $5, version = version + 1
				where organization_id = $1 and id = $2 and status = $6
			`, in.OrganizationID, in.DocumentID, StatusCorrectionRegistered, ProcessingCompleted, now, StatusAuthorized)
		}

		payloadType := PayloadManifestationEvent
		switch strings.ToLower(in.EventKind) {
		case "cancel":
			payloadType = PayloadCancelResponse
		case "cce":
			payloadType = PayloadCceResponse
		}

		objectKey := strings.TrimSpace(in.XMLObjectKey)
		if objectKey == "" && in.XMLBase64 != "" {
			raw, decErr := base64.StdEncoding.DecodeString(in.XMLBase64)
			if decErr != nil {
				return domainerr.Validation("invalid_xml_base64", "xml_base64 is not valid base64")
			}
			if s.store != nil {
				originalKey, keyErr := originalPayloadObjectKeyTx(ctx, tx, in.DocumentID)
				if keyErr != nil || originalKey == "" {
					originalKey = "fiscal/" + in.OrganizationID.String() + "/" + in.DocumentID.String()
				}
				objectKey = originalKey + "." + payloadType + ".xml"
				if putErr := s.store.Put(ctx, objectKey, "application/xml", raw); putErr != nil {
					return putErr
				}
				_ = crypto.SHA256Hex(raw) // keep hash path consistent with registerStoredPayload
				s.registerStoredPayload(ctx, tx, in.OrganizationID, in.DocumentID, payloadType, objectKey, "application/xml")
			}
		} else if objectKey != "" {
			s.registerStoredPayload(ctx, tx, in.OrganizationID, in.DocumentID, payloadType, objectKey, "application/xml")
		}
		return nil
	})
}

func outboundEventAlreadyRecorded(ctx context.Context, tx pgx.Tx, documentID uuid.UUID, protocol, tpEvento, nSeq string) (bool, error) {
	protocol = strings.TrimSpace(protocol)
	tpEvento = strings.TrimSpace(tpEvento)
	nSeq = strings.TrimSpace(nSeq)
	if protocol == "" && (tpEvento == "" || nSeq == "") {
		return false, nil
	}
	var n int
	err := tx.QueryRow(ctx, `
		select count(*) from organization_document_events
		where organization_document_id = $1
		  and (
		    ($2 <> '' and metadata_json->>'protocol' = $2)
		    or ($3 <> '' and $4 <> '' and metadata_json->>'tp_evento' = $3 and metadata_json->>'n_seq_evento' = $4)
		  )
	`, documentID, protocol, tpEvento, nSeq).Scan(&n)
	return n > 0, err
}

// FindOutboundNFeByAccessKey returns the outbound NF-e for this access key.
func (s *Service) FindOutboundNFeByAccessKey(ctx context.Context, organizationID uuid.UUID, accessKey string) (*Document, error) {
	key := normalizeAccessKey(accessKey)
	if key == "" {
		return nil, nil
	}
	doc, err := s.scanDocument(ctx, `
		select d.id, d.organization_id, d.organization_company_id, d.document_type, d.direction, d.environment,
		       d.external_id, d.source_system, d.source_document_id, d.idempotency_key, d.document_key,
		       d.status, d.processing_status, d.current_version, d.correlation_id, d.trace_id,
		       d.received_at, d.completed_at, d.created_at, d.updated_at
		from organization_documents d
		join organization_nfe n on n.organization_document_id = d.id
		where d.organization_id = $1
		  and d.document_type = 'nfe'
		  and d.direction = 'outbound'
		  and regexp_replace(upper(trim(coalesce(n.access_key, ''))), '[^0-9A-Z]', '', 'g') = $2
		order by d.received_at desc
		limit 1
	`, organizationID, key)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "document_not_found" {
			return nil, nil
		}
		return nil, err
	}
	return doc, nil
}

// FindOutboundNFSeByNumber returns the outbound NFS-e whose authorized number
// matches. Municipal notes (IPM/Garuva) have no access key, so SAP cancels
// them by this number. providerCNPJ disambiguates when the org has more than
// one match; an empty CNPJ is accepted only when the number is unique.
func (s *Service) FindOutboundNFSeByNumber(ctx context.Context, organizationID uuid.UUID, number, providerCNPJ string) (*Document, error) {
	num := normalizeNFSeNumber(number)
	if num == "" || num == "0" {
		return nil, nil
	}
	cnpj := digitsOnly(providerCNPJ)
	rows, err := s.pool.Query(ctx, `
		select d.id
		from organization_documents d
		join organization_nfse n on n.organization_document_id = d.id
		where d.organization_id = $1
		  and d.document_type = 'nfse'
		  and d.direction = 'outbound'
		  and nullif(ltrim(regexp_replace(coalesce(n.nfse_number, ''), '[^0-9]', '', 'g'), '0'), '') = $2
		  and ($3 = '' or regexp_replace(coalesce(n.provider_cnpj, ''), '[^0-9]', '', 'g') = $3)
		order by d.received_at desc
		limit 2
	`, organizationID, num, cnpj)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}
	if len(ids) > 1 {
		return nil, domainerr.Conflict("ambiguous_nfse_number", "More than one NFS-e matches this number; send document_id or cnpj_prestador")
	}
	return s.GetDocument(ctx, organizationID, ids[0])
}

// FindOutboundNFSeByAccessKey returns the outbound NFS-e for this access key.
func (s *Service) FindOutboundNFSeByAccessKey(ctx context.Context, organizationID uuid.UUID, accessKey string) (*Document, error) {
	key := normalizeAccessKey(accessKey)
	if key == "" {
		return nil, nil
	}
	doc, err := s.scanDocument(ctx, `
		select d.id, d.organization_id, d.organization_company_id, d.document_type, d.direction, d.environment,
		       d.external_id, d.source_system, d.source_document_id, d.idempotency_key, d.document_key,
		       d.status, d.processing_status, d.current_version, d.correlation_id, d.trace_id,
		       d.received_at, d.completed_at, d.created_at, d.updated_at
		from organization_documents d
		join organization_nfse n on n.organization_document_id = d.id
		where d.organization_id = $1
		  and d.document_type = 'nfse'
		  and d.direction = 'outbound'
		  and regexp_replace(upper(trim(coalesce(n.access_key, ''))), '[^0-9A-Z]', '', 'g') = $2
		order by d.received_at desc
		limit 1
	`, organizationID, key)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "document_not_found" {
			return nil, nil
		}
		return nil, err
	}
	return doc, nil
}
