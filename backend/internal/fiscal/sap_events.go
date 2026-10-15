package fiscal

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

// MaxDanfePDFBytes caps the decoded DANFE PDF uploaded by SAP.
const MaxDanfePDFBytes = 10 << 20

// ResolveSAPOutboundNFe finds the outbound NF-e for a 44-digit access key.
// Unlike GetDocumentByRef it never creates a status-consult stub.
func (s *Service) ResolveSAPOutboundNFe(ctx context.Context, organizationID uuid.UUID, accessKey string) (*Document, error) {
	if !LooksLikeNFeAccessKey(accessKey) {
		return nil, domainerr.Validation("invalid_access_key", "chave_acesso must have 44 digits")
	}
	doc, err := s.FindOutboundNFeByAccessKey(ctx, organizationID, accessKey)
	if err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, domainerr.NotFound("document_not_found", "No outbound NF-e found for this chave_acesso")
	}
	return doc, nil
}

// ResolveSAPOutboundNFSe finds an outbound NFS-e by document UUID or by the
// national access key (50 digits). It never creates a stub.
func (s *Service) ResolveSAPOutboundNFSe(ctx context.Context, organizationID uuid.UUID, ref string) (*Document, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, domainerr.Validation("invalid_document_ref", "chave_acesso or document_id is required")
	}
	if id, err := uuid.Parse(ref); err == nil {
		doc, err := s.GetDocument(ctx, organizationID, id)
		if err != nil {
			return nil, err
		}
		if !strings.EqualFold(doc.DocumentType, "nfse") || !strings.EqualFold(doc.Direction, "outbound") {
			return nil, domainerr.NotFound("document_not_found", "No outbound NFS-e found for this document_id")
		}
		return doc, nil
	}
	doc, err := s.FindOutboundNFSeByAccessKey(ctx, organizationID, ref)
	if err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, domainerr.NotFound("document_not_found", "No outbound NFS-e found for this chave_acesso")
	}
	return doc, nil
}

// SAPNFeStatus is the GET .../sap/{chave}/status response body.
type SAPNFeStatus struct {
	DocumentID       uuid.UUID      `json:"document_id"`
	AccessKey        string         `json:"chave_acesso"`
	Status           string         `json:"status"`
	ProcessingStatus string         `json:"processing_status"`
	Environment      string         `json:"environment"`
	Protocol         string         `json:"protocolo,omitempty"`
	HasDanfe         bool           `json:"has_danfe"`
	LastEvent        *DocumentEvent `json:"last_event,omitempty"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

// GetSAPNFeStatus summarizes the outbound NF-e state for SAP polling.
func (s *Service) GetSAPNFeStatus(ctx context.Context, doc *Document) (*SAPNFeStatus, error) {
	out := &SAPNFeStatus{
		DocumentID:       doc.ID,
		Status:           doc.Status,
		ProcessingStatus: doc.ProcessingStatus,
		Environment:      doc.Environment,
		UpdatedAt:        doc.UpdatedAt,
	}
	var accessKey, protocol *string
	err := s.pool.QueryRow(ctx, `
		select nullif(trim(access_key), ''), nullif(trim(authorization_protocol), '')
		from organization_nfe
		where organization_id = $1 and organization_document_id = $2
	`, doc.OrganizationID, doc.ID).Scan(&accessKey, &protocol)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if accessKey != nil {
		out.AccessKey = normalizeAccessKey(*accessKey)
	}
	if protocol != nil {
		out.Protocol = *protocol
	}

	var ev DocumentEvent
	err = s.pool.QueryRow(ctx, `
		select id, organization_id, organization_document_id, event_type, from_status, to_status,
		       actor_type, actor_id, metadata_json, occurred_at
		from organization_document_events
		where organization_id = $1 and organization_document_id = $2
		order by occurred_at desc
		limit 1
	`, doc.OrganizationID, doc.ID).Scan(&ev.ID, &ev.OrganizationID, &ev.OrganizationDocumentID, &ev.EventType,
		&ev.FromStatus, &ev.ToStatus, &ev.ActorType, &ev.ActorID, &ev.MetadataJSON, &ev.OccurredAt)
	if err == nil {
		out.LastEvent = &ev
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	if err := s.pool.QueryRow(ctx, `
		select exists(
			select 1 from organization_document_payloads
			where organization_document_id = $1 and payload_type = $2
		)
	`, doc.ID, PayloadDanfe).Scan(&out.HasDanfe); err != nil {
		return nil, err
	}
	return out, nil
}

// eventResponseSuffix returns the object-key suffix nfe-gateway uses for an
// event response XML (see event_consumer._persist_event_xmls).
func eventResponseSuffix(kind string, seq int) (payloadType, suffix string, err error) {
	switch kind {
	case "cancel":
		return PayloadCancelResponse, ".cancel_response.xml", nil
	case "cce":
		if seq <= 1 {
			return PayloadCceResponse, ".cce_response.xml", nil
		}
		return PayloadCceResponse, fmt.Sprintf(".cce_%d_response.xml", seq), nil
	default:
		return "", "", domainerr.Validation("invalid_event_type", "tipo_evento must be cancel or cce")
	}
}

// LoadEventPayloadBySeq returns the SEFAZ response XML of a cancel or CC-e
// event. For CC-e, n_seq_evento selects the specific correction.
func (s *Service) LoadEventPayloadBySeq(ctx context.Context, doc *Document, kind string, seq int) (*DocumentPayloadDownload, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if seq < 1 || seq > 20 {
		return nil, domainerr.Validation("invalid_n_seq_evento", "n_seq_evento must be between 1 and 20")
	}
	payloadType, suffix, err := eventResponseSuffix(kind, seq)
	if err != nil {
		return nil, err
	}

	var objectKey string
	err = s.pool.QueryRow(ctx, `
		select storage_object_key from organization_document_payloads
		where organization_document_id = $1 and payload_type = $2 and storage_object_key like '%' || $3
		order by created_at desc limit 1
	`, doc.ID, payloadType, suffix).Scan(&objectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		originalKey, keyErr := s.OriginalPayloadObjectKey(ctx, doc.ID)
		if keyErr != nil {
			return nil, domainerr.NotFound("event_xml_not_found", "Event XML not found")
		}
		objectKey = originalKey + suffix
	} else if err != nil {
		return nil, err
	}

	data, err := s.store.Get(ctx, objectKey)
	if err != nil || len(data) == 0 {
		return nil, domainerr.NotFound("event_xml_not_found", "Event XML not found")
	}
	name := s.downloadBaseNameFromXML(ctx, doc, data)
	filename := name + "-cancelamento.xml"
	if kind == "cce" {
		filename = fmt.Sprintf("%s-cce-%d.xml", name, seq)
	}
	return &DocumentPayloadDownload{Document: doc, Data: data, ContentType: "application/xml", Filename: filename}, nil
}

// DecodeDanfePDF decodes the base64 PDF sent by SAP (plain or data URI) and
// checks it is a PDF within MaxDanfePDFBytes.
func DecodeDanfePDF(encoded string) ([]byte, error) {
	encoded = strings.TrimSpace(encoded)
	if i := strings.Index(encoded, ";base64,"); i >= 0 && strings.HasPrefix(encoded, "data:") {
		encoded = encoded[i+len(";base64,"):]
	}
	encoded = strings.Map(func(r rune) rune {
		switch r {
		case ' ', '\n', '\r', '\t':
			return -1
		}
		return r
	}, encoded)
	if encoded == "" {
		return nil, domainerr.Validation("missing_pdf_base64", "pdf_base64 is required")
	}
	if base64.StdEncoding.DecodedLen(len(encoded)) > MaxDanfePDFBytes+3 {
		return nil, domainerr.Validation("danfe_too_large", fmt.Sprintf("DANFE PDF must be at most %d bytes", MaxDanfePDFBytes))
	}
	pdf, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		pdf, err = base64.RawStdEncoding.DecodeString(strings.TrimRight(encoded, "="))
	}
	if err != nil {
		return nil, domainerr.Validation("invalid_pdf_base64", "pdf_base64 is not valid base64")
	}
	if len(pdf) > MaxDanfePDFBytes {
		return nil, domainerr.Validation("danfe_too_large", fmt.Sprintf("DANFE PDF must be at most %d bytes", MaxDanfePDFBytes))
	}
	if !bytes.HasPrefix(bytes.TrimLeft(pdf, "\x00\t\r\n "), []byte("%PDF")) {
		return nil, domainerr.Validation("invalid_pdf", "pdf_base64 does not contain a PDF document")
	}
	return pdf, nil
}

// StoreDanfe persists the SAP-generated DANFE PDF for an outbound NF-e. Each
// upload gets its own object; downloads always return the latest one.
func (s *Service) StoreDanfe(ctx context.Context, doc *Document, pdf []byte, filename, actorType, actorID string) error {
	if !strings.EqualFold(doc.DocumentType, "nfe") || !strings.EqualFold(doc.Direction, "outbound") {
		return domainerr.Validation("not_outbound_nfe", "DANFE upload is only available for outbound NF-e")
	}
	id := ids.New()
	objectKey := storage.ObjectKey(s.prefix, doc.OrganizationID.String(), doc.ID.String(), PayloadDanfe, id.String()+".pdf")
	if err := s.store.Put(ctx, objectKey, "application/pdf", pdf); err != nil {
		return err
	}
	now := time.Now().UTC()
	sha := crypto.SHA256Hex(pdf)
	return s.pool.WithTenant(ctx, doc.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into organization_document_payloads (
				id, organization_id, organization_document_id, payload_type, content_type,
				storage_object_key, sha256, size_bytes, contains_sensitive_data, created_at
			) values ($1,$2,$3,$4,'application/pdf',$5,$6,$7,false,$8)
		`, id, doc.OrganizationID, doc.ID, PayloadDanfe, objectKey, sha, len(pdf), now); err != nil {
			return err
		}
		meta, _ := json.Marshal(map[string]any{
			"filename":   strings.TrimSpace(filename),
			"size_bytes": len(pdf),
			"sha256":     sha,
		})
		_, err := tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9)
		`, ids.New(), doc.OrganizationID, doc.ID, messaging.EventDocumentDanfeUploaded, doc.Status,
			actorType, nullEmpty(actorID), meta, now)
		return err
	})
}
