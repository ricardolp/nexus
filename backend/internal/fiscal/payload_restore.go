package fiscal

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

// inboundLogBody is one captured inbound HTTP body (Integrações → log de entrada).
type inboundLogBody struct {
	Preview     string
	RequestHash string
}

// completeInboundBody returns the log body that is the full original payload.
// The entry log keeps at most a preview; only a body whose SHA-256 matches the
// payload row is safe to put back in object storage.
func completeInboundBody(rows []inboundLogBody, payloadSHA, contentType string) []byte {
	want := strings.ToLower(strings.TrimSpace(payloadSHA))
	if want == "" {
		return nil
	}
	for _, row := range rows {
		body := []byte(row.Preview)
		if len(bytes.TrimSpace(body)) == 0 {
			continue
		}
		if !strings.EqualFold(crypto.SHA256Hex(body), want) {
			continue
		}
		logged := strings.ToLower(strings.TrimSpace(row.RequestHash))
		if logged != "" && logged != want {
			continue
		}
		if !bodyMatchesContentType(body, contentType) {
			continue
		}
		return body
	}
	return nil
}

func bodyMatchesContentType(body []byte, contentType string) bool {
	kind := strings.ToLower(contentType)
	trimmed := bytes.TrimSpace(body)
	switch {
	case strings.Contains(kind, "xml"):
		return bytes.HasPrefix(trimmed, []byte("<"))
	case strings.Contains(kind, "json"), kind == "":
		return json.Valid(trimmed)
	default:
		return json.Valid(trimmed) || bytes.HasPrefix(trimmed, []byte("<"))
	}
}

func (s *Service) restoreOriginalPayload(ctx context.Context, documentID uuid.UUID, objectKey, payloadSHA, contentType string) (bool, error) {
	var organizationID, correlationID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		select organization_id, correlation_id
		from organization_documents
		where id = $1
	`, documentID).Scan(&organizationID, &correlationID)
	if err != nil {
		return false, err
	}

	rows, err := s.pool.Query(ctx, `
		select request_body_preview, coalesce(request_hash, '')
		from request_traces
		where organization_id = $1
		  and correlation_id = $2
		  and coalesce(direction, 'inbound') = 'inbound'
		  and request_body_preview is not null
		order by started_at desc
		limit 20
	`, organizationID, correlationID)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var logged []inboundLogBody
	for rows.Next() {
		var row inboundLogBody
		if err := rows.Scan(&row.Preview, &row.RequestHash); err != nil {
			return false, err
		}
		logged = append(logged, row)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}

	body := completeInboundBody(logged, payloadSHA, contentType)
	if body == nil {
		return false, nil
	}
	if err := s.store.Put(ctx, objectKey, contentType, body); err != nil {
		return false, err
	}
	slog.Warn("restored original payload from inbound log", "document_id", documentID, "object_key", objectKey)
	return true, nil
}

func (s *Service) ensureOriginalPayloadBlob(ctx context.Context, documentID uuid.UUID) error {
	var objectKey, payloadSHA, contentType string
	err := s.pool.QueryRow(ctx, `
		select storage_object_key, sha256, content_type
		from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at desc limit 1
	`, documentID).Scan(&objectKey, &payloadSHA, &contentType)
	if err != nil {
		return err
	}
	if _, err := s.store.Get(ctx, objectKey); err == nil {
		return nil
	} else if !storage.IsNotFound(err) {
		return err
	}
	restored, err := s.restoreOriginalPayload(ctx, documentID, objectKey, payloadSHA, contentType)
	if err != nil {
		return err
	}
	if !restored {
		return domainerr.NotFound("payload_not_found", PayloadMissingMessage)
	}
	return nil
}
