package fiscal

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/danfse"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

type Service struct {
	pool   *db.Pool
	store  storage.ObjectStore
	orgs   *organization.Service
	prefix string
}

func NewService(pool *db.Pool, store storage.ObjectStore, orgs *organization.Service, storagePrefix string) *Service {
	return &Service{pool: pool, store: store, orgs: orgs, prefix: storagePrefix}
}

func (s *Service) Receive(ctx context.Context, in ReceiveInput) (*ReceiveResult, error) {
	norm, err := NormalizeReceiveInput(in)
	if err != nil {
		return nil, err
	}
	docType := norm.DocumentType
	direction := norm.Direction
	contentType := norm.ContentType
	serviceCode := norm.ServiceCode
	payloadBytes := in.Payload

	nfe := in.NFe
	nfse := in.NFSe
	var sapPayload *SAPNFePayload
	var sapNFSePayload *SAPNFSePayload
	if docType == "nfe" {
		nfe = mergeNFe(in.NFe, extractNFeFromPayload(payloadBytes))

		// For outbound NF-e, parse and validate SAP payload early
		if direction == "outbound" {
			sp, normalized, err := ParseSAPNFePayloadNormalized(payloadBytes)
			if err != nil {
				return nil, err
			}
			if err := ValidateSAPNFeOutbound(sp); err != nil {
				return nil, err
			}
			sapPayload = sp
			payloadBytes = normalized

			// Enhance nfe extension with SAP data for company resolution
			if nfe == nil {
				nfe = &NFeExtension{}
			}
			if nfe.Series == "" && sp.Serie != nil {
				nfe.Series = *sp.Serie
			}
			if nfe.Number == "" && sp.Numero != nil {
				nfe.Number = *sp.Numero
			}
			if nfe.IssuerCNPJ == "" && sp.CnpjEmitente != nil {
				nfe.IssuerCNPJ = *sp.CnpjEmitente
			}
			if nfe.RecipientDocument == "" {
				if sp.CnpjDestinatario != nil {
					nfe.RecipientDocument = *sp.CnpjDestinatario
				} else if sp.CpfDestinatario != nil {
					nfe.RecipientDocument = *sp.CpfDestinatario
				}
			}
			if nfe.IssuedAt == nil && sp.DataEmissao != nil {
				nfe.IssuedAt = parseRFC3339(sp.DataEmissao)
			}
		}
	}
	if docType == "nfse" {
		nfse = mergeNFSe(in.NFSe, extractNFSeFromPayload(in.Payload))
		if direction == "outbound" {
			req, err := ParseSAPNFSePayload(in.Payload)
			if err != nil {
				return nil, err
			}
			if err := ValidateSAPNFSeOutbound(req); err != nil {
				return nil, err
			}
			sapNFSePayload = req
			if nfse == nil {
				nfse = &NFSeExtension{}
			}
			parsed := nfseExtensionFromSAP(req)
			if nfse.MunicipalityCode == "" {
				nfse.MunicipalityCode = parsed.MunicipalityCode
			}
			if nfse.RPSNumber == "" {
				nfse.RPSNumber = parsed.RPSNumber
			}
			if nfse.RPSSeries == "" {
				nfse.RPSSeries = parsed.RPSSeries
			}
			if nfse.IssuerCNPJ == "" {
				nfse.IssuerCNPJ = parsed.IssuerCNPJ
			}
		}
	}

	company, err := s.resolveCompany(ctx, in.OrganizationID, in.OrganizationCompanyID, direction, nfe, nfse)
	if err != nil {
		return nil, err
	}
	companyID := company.ID
	env := in.Environment
	if env == "" {
		env = company.Environment
	}

	ok, err := s.orgs.HasCompanyService(ctx, in.OrganizationID, companyID, serviceCode)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, domainerr.Validation("document_service_disabled", "The requested fiscal service is not enabled for this company.")
	}

	requestHash := crypto.SHA256Hex(payloadBytes)

	// Idempotência: se já existe e hash bate, devolve o documento.
	existing, err := s.findByIdempotency(ctx, in.OrganizationID, companyID, in.SourceSystem, in.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		same, err := s.sameRequestHash(ctx, existing.ID, requestHash)
		if err != nil {
			return nil, err
		}
		if !same {
			return nil, domainerr.Conflict("idempotency_key_reuse", "Idempotency-Key reused with a different payload")
		}
		return &ReceiveResult{Document: existing, Replayed: true}, nil
	}

	now := time.Now().UTC()
	doc := &Document{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: companyID,
		DocumentType:          docType,
		Direction:             direction,
		Environment:           env,
		SourceSystem:          in.SourceSystem,
		IdempotencyKey:        in.IdempotencyKey,
		Status:                StatusReceived,
		ProcessingStatus:      ProcessingQueued,
		CurrentVersion:        1,
		CorrelationID:         in.CorrelationID,
		TraceID:               in.TraceID,
		ReceivedAt:            now,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	if in.ExternalID != "" {
		doc.ExternalID = &in.ExternalID
	}
	if in.SourceDocumentID != "" {
		doc.SourceDocumentID = &in.SourceDocumentID
	}
	if in.DocumentKey != "" {
		doc.DocumentKey = &in.DocumentKey
	}

	objectKey := storage.ObjectKey(s.prefix, in.OrganizationID.String(), doc.ID.String(), "original_request", "payload.bin")
	if err := s.store.Put(ctx, objectKey, contentType, payloadBytes); err != nil {
		return nil, err
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_documents (
				id, organization_id, organization_company_id, document_type, direction, environment,
				external_id, source_system, source_document_id, idempotency_key, document_key,
				status, processing_status, current_version, correlation_id, trace_id,
				received_at, created_at, updated_at
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
			)
		`,
			doc.ID, doc.OrganizationID, doc.OrganizationCompanyID, doc.DocumentType, doc.Direction, doc.Environment,
			doc.ExternalID, doc.SourceSystem, doc.SourceDocumentID, doc.IdempotencyKey, doc.DocumentKey,
			doc.Status, doc.ProcessingStatus, doc.CurrentVersion, doc.CorrelationID, doc.TraceID,
			doc.ReceivedAt, doc.CreatedAt, doc.UpdatedAt,
		)
		if err != nil {
			if strings.Contains(err.Error(), "organization_documents") && strings.Contains(err.Error(), "unique") {
				return domainerr.Conflict("idempotency_key_reuse", "Document already received")
			}
			return err
		}

		payloadID := ids.New()
		_, err = tx.Exec(ctx, `
			insert into organization_document_payloads (
				id, organization_id, organization_document_id, payload_type, content_type,
				storage_object_key, sha256, size_bytes, contains_sensitive_data, created_at
			) values ($1,$2,$3,'original_request',$4,$5,$6,$7,true,$8)
		`, payloadID, in.OrganizationID, doc.ID, contentType, objectKey, requestHash, len(payloadBytes), now)
		if err != nil {
			return err
		}

		if docType == "nfe" {
			var accessKey, series, number, model, issuerCNPJ, recipient string
			var issuedAt *time.Time
			meta := []byte(`{}`)
			if nfe != nil {
				accessKey, series, number, model = nfe.AccessKey, nfe.Series, nfe.Number, nfe.Model
				issuerCNPJ, recipient, issuedAt = nfe.IssuerCNPJ, nfe.RecipientDocument, nfe.IssuedAt
				if len(nfe.MetadataJSON) > 0 {
					meta = nfe.MetadataJSON
				}
			}
			_, err = tx.Exec(ctx, `
				insert into organization_nfe (
					organization_document_id, organization_id, access_key, series, number, model,
					issuer_cnpj, recipient_document, issued_at, metadata_json
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			`, doc.ID, in.OrganizationID, nullEmpty(accessKey), nullEmpty(series), nullEmpty(number), nullEmpty(model),
				nullEmpty(issuerCNPJ), nullEmpty(recipient), issuedAt, meta)
			if err != nil {
				return err
			}

			// For outbound NF-e, persist the full SAP payload into relational schema
			if direction == "outbound" && sapPayload != nil {
				if err := s.persistOutboundNFe(ctx, tx, in.OrganizationID, doc.ID, sapPayload, company.UF); err != nil {
					return err
				}
			}
		} else {
			if nfse == nil {
				nfse = &NFSeExtension{}
			}
			_, err = tx.Exec(ctx, `
				insert into organization_nfse (
					organization_document_id, organization_id, municipality_code, provider_code, rps_number, rps_series, metadata_json
				) values ($1,$2,$3,$4,$5,$6,'{}'::jsonb)
			`, doc.ID, in.OrganizationID, nullEmpty(nfse.MunicipalityCode), nullEmpty(nfse.ProviderCode), nullEmpty(nfse.RPSNumber), nullEmpty(nfse.RPSSeries))
			if err != nil {
				return err
			}
			if direction == "outbound" && sapNFSePayload != nil {
				if err := s.persistOutboundNFSe(ctx, tx, in.OrganizationID, doc.ID, sapNFSePayload); err != nil {
					return err
				}
			}
		}

		toStatus := doc.Status
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, correlation_id, trace_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,null,$5,$6,$7,$8,$9,'{}'::jsonb,$10)
		`, ids.New(), in.OrganizationID, doc.ID, messaging.EventDocumentReceived, toStatus, in.ActorType, nullEmpty(in.ActorID), in.CorrelationID, in.TraceID, now)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			insert into idempotency_records (
				id, organization_id, scope, idempotency_key, request_hash, status, response_status, response_body, expires_at, created_at
			) values ($1,$2,'fiscal_documents',$3,$4,'completed',202,$5, now() + interval '24 hours', $6)
		`, ids.New(), in.OrganizationID, in.IdempotencyKey, requestHash, mustJSON(map[string]any{
			"document_id": doc.ID,
			"trace_id":    doc.TraceID,
			"status":      doc.Status,
		}), now)
		if err != nil {
			return err
		}

		_, err = messaging.InsertOutbox(ctx, tx, in.OrganizationID, "organization_documents", doc.ID, messaging.EventDocumentReceived, map[string]any{
			"document_id": doc.ID,
			"status":      doc.Status,
		})
		return err
	})
	if err != nil {
		return nil, err
	}

	return &ReceiveResult{Document: doc, Replayed: false}, nil
}

// resolveCompany finds the target organization_company either by the explicit
// organization_company_id or, when absent, by the CNPJ already carried in the
// document payload: NF-e issuer (outbound) / recipient (inbound), or NFS-e
// prestador.cnpj (outbound).
func (s *Service) resolveCompany(ctx context.Context, organizationID, companyID uuid.UUID, direction string, nfe *NFeExtension, nfse *NFSeExtension) (*organization.Company, error) {
	if companyID != uuid.Nil {
		return s.orgs.GetCompany(ctx, organizationID, companyID)
	}
	cnpj := ""
	if nfe != nil {
		cnpj = nfe.IssuerCNPJ
		if direction == "inbound" {
			cnpj = nfe.RecipientDocument
		}
	}
	if strings.TrimSpace(cnpj) == "" && nfse != nil {
		cnpj = nfse.IssuerCNPJ
	}
	if strings.TrimSpace(cnpj) == "" {
		return nil, domainerr.Validation("missing_company", "organization_company_id is required, or the payload must include the company CNPJ (nfe issuer/recipient or nfse prestador.cnpj)")
	}
	return s.orgs.GetCompanyByCNPJ(ctx, organizationID, cnpj)
}

const (
	PayloadOriginalRequest = "original_request"
	PayloadProviderRequest = "provider_request"
	PayloadSefazResponse   = "sefaz_response"
	PayloadCancelRequest   = "cancel_request"
	PayloadCancelResponse  = "cancel_response"
	PayloadDanfse          = "danfse"
)

func originalPayloadObjectKeyTx(ctx context.Context, tx pgx.Tx, documentID uuid.UUID) (string, error) {
	var key string
	err := tx.QueryRow(ctx, `
		select storage_object_key from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at asc limit 1
	`, documentID).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domainerr.NotFound("payload_not_found", "Original request payload not found")
	}
	return key, err
}

func (s *Service) registerStoredPayload(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, payloadType, objectKey, contentType string) {
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" {
		return
	}
	var exists bool
	if err := tx.QueryRow(ctx, `
		select exists(
			select 1 from organization_document_payloads
			where organization_document_id = $1 and payload_type = $2
		)
	`, documentID, payloadType).Scan(&exists); err != nil || exists {
		return
	}
	data, err := s.store.Get(ctx, objectKey)
	if err != nil || len(data) == 0 {
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, _ = tx.Exec(ctx, `
		insert into organization_document_payloads (
			id, organization_id, organization_document_id, payload_type, content_type,
			storage_object_key, sha256, size_bytes, contains_sensitive_data, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,true,now())
	`, ids.New(), organizationID, documentID, payloadType, contentType, objectKey, crypto.SHA256Hex(data), len(data))
}

// RegisterCancelPayloads records cancel_request / cancel_response object keys
// after an accepted (or rejected-with-XML) cancel/CC-e event from nfe-gateway.
func (s *Service) RegisterCancelPayloads(ctx context.Context, organizationID, documentID uuid.UUID, requestKey, responseKey string) error {
	requestKey = strings.TrimSpace(requestKey)
	responseKey = strings.TrimSpace(responseKey)
	if requestKey == "" && responseKey == "" {
		return nil
	}
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		s.registerStoredPayload(ctx, tx, organizationID, documentID, PayloadCancelRequest, requestKey, "application/xml")
		s.registerStoredPayload(ctx, tx, organizationID, documentID, PayloadCancelResponse, responseKey, "application/xml")
		return nil
	})
}

// OriginalPayloadObjectKey returns the object storage key of the document's
// original request payload — what MessagingProvider hands the nfe-gateway
// so it can build/sign the NF-e, without the raw XML/JSON ever travelling
// through RabbitMQ (see 08_messaging_and_workers.md).
func (s *Service) OriginalPayloadObjectKey(ctx context.Context, documentID uuid.UUID) (string, error) {
	var key string
	err := s.pool.QueryRow(ctx, `
		select storage_object_key from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at asc limit 1
	`, documentID).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domainerr.NotFound("payload_not_found", "Original request payload not found")
	}
	if err != nil {
		return "", err
	}
	return key, nil
}

// DocumentPayloadDownload is what a client needs to stream a document's
// original XML/JSON back out: the bytes themselves plus enough metadata to
// set sane HTTP response headers.
type DocumentPayloadDownload struct {
	Document    *Document
	Data        []byte
	ContentType string
	Filename    string
}

// DownloadOriginalPayload fetches a document's original request payload.
func (s *Service) DownloadOriginalPayload(ctx context.Context, organizationID, documentID uuid.UUID) (*DocumentPayloadDownload, error) {
	return s.DownloadPayload(ctx, organizationID, documentID, PayloadOriginalRequest)
}

// DownloadPayload fetches a stored payload. Empty payloadType picks the signed
// XML sent to the authority for outbound documents (provider_request), falling
// back to the original request JSON/XML — including objects the gateway wrote
// with a derived key even if they were never registered in the payloads table.
//
// payload_type=danfse generates the national DANFSe PDF on demand from the
// authorized NFS-e XML (sefaz_response).
func (s *Service) DownloadPayload(ctx context.Context, organizationID, documentID uuid.UUID, payloadType string) (*DocumentPayloadDownload, error) {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}

	wanted := strings.TrimSpace(payloadType)
	if wanted == "" || wanted == "auto" {
		if strings.EqualFold(doc.Direction, "outbound") {
			if dl, err := s.loadPayload(ctx, doc, PayloadProviderRequest); err == nil {
				return dl, nil
			}
		}
		return s.loadPayload(ctx, doc, PayloadOriginalRequest)
	}
	if wanted == PayloadDanfse {
		return s.renderDanfse(ctx, doc)
	}
	return s.loadPayload(ctx, doc, wanted)
}

func (s *Service) renderDanfse(ctx context.Context, doc *Document) (*DocumentPayloadDownload, error) {
	if !strings.EqualFold(doc.DocumentType, "nfse") {
		return nil, domainerr.Validation("danfse_not_supported", "DANFSe is only available for NFS-e documents")
	}
	xmlDL, err := s.loadPayload(ctx, doc, PayloadSefazResponse)
	if err != nil {
		return nil, domainerr.NotFound("danfse_xml_not_found", "Authorized NFS-e XML not found; DANFSe requires a successful SEFIN authorization")
	}
	if looksLikeJSON(xmlDL.Data) || !looksLikeNFSeXML(xmlDL.Data) {
		return nil, domainerr.Validation("danfse_xml_invalid", "SEFIN response is not a valid authorized NFS-e XML")
	}
	pdf, err := danfse.NewDanfseRenderer().Render(xmlDL.Data, s.danfseRenderOptions(ctx, doc))
	if err != nil {
		return nil, domainerr.Validation("danfse_render_failed", "Failed to generate DANFSe PDF: "+err.Error())
	}
	name := doc.ID.String()
	if doc.DocumentKey != nil && *doc.DocumentKey != "" {
		name = *doc.DocumentKey
	} else if doc.ExternalID != nil && *doc.ExternalID != "" {
		name = *doc.ExternalID
	}
	return &DocumentPayloadDownload{
		Document:    doc,
		Data:        pdf,
		ContentType: "application/pdf",
		Filename:    name + "-danfse.pdf",
	}, nil
}

// danfseRenderOptions maps document lifecycle to NT 008 watermarks.
// Cancel/substitution are events — authorized XML keeps cStat=100.
func (s *Service) danfseRenderOptions(ctx context.Context, doc *Document) danfse.RenderOptions {
	var opts danfse.RenderOptions
	if doc == nil || !strings.EqualFold(doc.Status, StatusCancelled) {
		return opts
	}
	var reason string
	_ = s.pool.QueryRow(ctx, `
		select coalesce(metadata_json->>'reason', '')
		from organization_document_events
		where organization_document_id = $1
		  and to_status = $2
		order by occurred_at desc
		limit 1
	`, doc.ID, StatusCancelled).Scan(&reason)
	if strings.EqualFold(reason, "substitution") {
		opts.Substituted = true
	} else {
		opts.Cancelled = true
	}
	return opts
}

func looksLikeNFSeXML(data []byte) bool {
	trimmed := strings.TrimSpace(string(data))
	if !strings.HasPrefix(trimmed, "<") {
		return false
	}
	lower := strings.ToLower(trimmed)
	return strings.Contains(lower, "infnfse") || strings.Contains(lower, ":nfse") || strings.Contains(lower, "<nfse")
}

func (s *Service) loadPayload(ctx context.Context, doc *Document, payloadType string) (*DocumentPayloadDownload, error) {
	var objectKey, contentType string
	err := s.pool.QueryRow(ctx, `
		select storage_object_key, content_type from organization_document_payloads
		where organization_document_id = $1 and payload_type = $2
		order by created_at desc limit 1
	`, doc.ID, payloadType).Scan(&objectKey, &contentType)
	if errors.Is(err, pgx.ErrNoRows) {
		originalKey, keyErr := s.OriginalPayloadObjectKey(ctx, doc.ID)
		if keyErr != nil {
			return nil, domainerr.NotFound("payload_not_found", "Payload not found")
		}
		switch payloadType {
		case PayloadProviderRequest:
			objectKey = originalKey + ".provider_request.xml"
			contentType = "application/xml"
		case PayloadSefazResponse:
			objectKey = originalKey + ".sefaz_response.xml"
			contentType = "application/xml"
		case PayloadCancelRequest:
			objectKey = originalKey + ".cancel_request.xml"
			contentType = "application/xml"
		case PayloadCancelResponse:
			objectKey = originalKey + ".cancel_response.xml"
			contentType = "application/xml"
		default:
			return nil, domainerr.NotFound("payload_not_found", "Payload not found")
		}
	} else if err != nil {
		return nil, err
	}

	data, err := s.store.Get(ctx, objectKey)
	if err != nil {
		return nil, domainerr.NotFound("payload_not_found", "Payload not found")
	}

	name := doc.ID.String()
	if doc.DocumentKey != nil && *doc.DocumentKey != "" {
		name = *doc.DocumentKey
	} else if doc.ExternalID != nil && *doc.ExternalID != "" {
		name = *doc.ExternalID
	}
	switch payloadType {
	case PayloadProviderRequest:
		name += "-enviado.xml"
		if contentType == "" {
			contentType = "application/xml"
		}
	case PayloadSefazResponse:
		name += "-retorno"
		if strings.Contains(contentType, "json") || looksLikeJSON(data) {
			name += ".json"
			contentType = "application/json"
		} else {
			name += ".xml"
			if contentType == "" {
				contentType = "application/xml"
			}
		}
	case PayloadCancelRequest:
		name += "-pedido-cancelamento.xml"
		if contentType == "" {
			contentType = "application/xml"
		}
	case PayloadCancelResponse:
		name += "-cancelamento.xml"
		if contentType == "" {
			contentType = "application/xml"
		}
	default:
		ext := ".xml"
		if strings.Contains(contentType, "json") {
			ext = ".json"
		}
		name += ext
	}

	return &DocumentPayloadDownload{Document: doc, Data: data, ContentType: contentType, Filename: name}, nil
}

func looksLikeJSON(data []byte) bool {
	trimmed := strings.TrimSpace(string(data))
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func (s *Service) GetDocument(ctx context.Context, organizationID, documentID uuid.UUID) (*Document, error) {
	return s.scanDocument(ctx, `
		select id, organization_id, organization_company_id, document_type, direction, environment,
		       external_id, source_system, source_document_id, idempotency_key, document_key,
		       status, processing_status, current_version, correlation_id, trace_id,
		       received_at, completed_at, created_at, updated_at
		from organization_documents
		where organization_id = $1 and id = $2
	`, organizationID, documentID)
}

// DeleteManualUpload permanently removes a document created through the
// manual XML upload path, along with its extension row, items, matches,
// validations, execution plan and stored payload — so the same XML (same
// access key) can be re-imported without colliding on its own idempotency
// key. Deliberately restricted to source_system == "manual_upload": NF-e
// received automatically from SEFAZ or issued through SAP integrations
// carry a legal retention obligation and must never become erasable through
// the app, so this can't be repurposed into a general "delete a fiscal
// document" tool. Child rows (organization_nfe, _items, matches,
// validations, execution plan/steps, document events/payloads) all cascade
// via FK on organization_documents — only idempotency_records (keyed by
// idempotency_key, not a FK to the document) needs an explicit delete.
func (s *Service) DeleteManualUpload(ctx context.Context, organizationID, documentID uuid.UUID) error {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return err
	}
	if doc.SourceSystem != "manual_upload" {
		return domainerr.Forbidden("Only manually uploaded documents can be deleted")
	}

	rows, err := s.pool.Query(ctx, `select storage_object_key from organization_document_payloads where organization_document_id = $1`, documentID)
	if err != nil {
		return err
	}
	var objectKeys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return err
		}
		objectKeys = append(objectKeys, key)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			delete from idempotency_records where organization_id = $1 and scope = 'fiscal_documents' and idempotency_key = $2
		`, organizationID, doc.IdempotencyKey); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `delete from organization_documents where id = $1 and organization_id = $2`, documentID, organizationID)
		return err
	})
	if err != nil {
		return err
	}

	for _, key := range objectKeys {
		_ = s.store.Delete(ctx, key)
	}
	return nil
}

func (s *Service) ListTimeline(ctx context.Context, organizationID, documentID uuid.UUID) ([]DocumentEvent, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_document_id, event_type, from_status, to_status,
		       actor_type, actor_id, metadata_json, occurred_at
		from organization_document_events
		where organization_id = $1 and organization_document_id = $2
		order by occurred_at asc
	`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []DocumentEvent
	for rows.Next() {
		var e DocumentEvent
		if err := rows.Scan(&e.ID, &e.OrganizationID, &e.OrganizationDocumentID, &e.EventType, &e.FromStatus, &e.ToStatus, &e.ActorType, &e.ActorID, &e.MetadataJSON, &e.OccurredAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (s *Service) ListOrganizationEvents(ctx context.Context, organizationID uuid.UUID, limit int) ([]EventListItem, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		select e.id, e.organization_id, e.organization_document_id, e.event_type, e.from_status, e.to_status,
		       e.actor_type, e.actor_id, e.metadata_json, e.occurred_at,
		       d.document_type, d.direction, d.document_key, d.source_system
		from organization_document_events e
		join organization_documents d on d.id = e.organization_document_id
		where e.organization_id = $1
		order by e.occurred_at desc
		limit $2
	`, organizationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []EventListItem
	for rows.Next() {
		var e EventListItem
		if err := rows.Scan(
			&e.ID, &e.OrganizationID, &e.OrganizationDocumentID, &e.EventType, &e.FromStatus, &e.ToStatus,
			&e.ActorType, &e.ActorID, &e.MetadataJSON, &e.OccurredAt,
			&e.DocumentType, &e.Direction, &e.DocumentKey, &e.SourceSystem,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (s *Service) RegisterManifestation(ctx context.Context, in RegisterManifestationInput) (*DocumentEvent, error) {
	manifestationType, err := ValidateManifestationType(in.ManifestationType)
	if err != nil {
		return nil, err
	}
	metadata := map[string]any{"manifestation_type": manifestationType}
	if notes := strings.TrimSpace(in.Notes); notes != "" {
		metadata["notes"] = notes
	}
	return s.insertDocumentEvent(ctx, in.OrganizationID, in.DocumentID, "manifestacao", in.ActorID, metadata)
}

func (s *Service) RegisterDeliveryReceipt(ctx context.Context, in RegisterDeliveryReceiptInput) (*DocumentEvent, error) {
	receivedBy := strings.TrimSpace(in.ReceivedBy)
	if receivedBy == "" {
		return nil, domainerr.Validation("received_by_required", "received_by is required")
	}
	receivedAt := in.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = time.Now().UTC()
	}
	metadata := map[string]any{"received_by": receivedBy, "received_at": receivedAt}
	if notes := strings.TrimSpace(in.Notes); notes != "" {
		metadata["notes"] = notes
	}
	return s.insertDocumentEvent(ctx, in.OrganizationID, in.DocumentID, "canhoto_registrado", in.ActorID, metadata)
}

func (s *Service) insertDocumentEvent(ctx context.Context, organizationID, documentID uuid.UUID, eventType string, actorID uuid.UUID, metadata map[string]any) (*DocumentEvent, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(select 1 from organization_documents where id = $1 and organization_id = $2)
	`, documentID, organizationID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, domainerr.NotFound("document_not_found", "Document not found")
	}

	meta, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	actor := actorID.String()
	event := &DocumentEvent{
		ID:                     ids.New(),
		OrganizationID:         organizationID,
		OrganizationDocumentID: documentID,
		EventType:              eventType,
		ActorType:              "user",
		ActorID:                &actor,
		MetadataJSON:           meta,
		OccurredAt:             now,
	}
	_, err = s.pool.Exec(ctx, `
		insert into organization_document_events (
			id, organization_id, organization_document_id, event_type, actor_type, actor_id, metadata_json, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8)
	`, event.ID, event.OrganizationID, event.OrganizationDocumentID, event.EventType, event.ActorType, actor, meta, now)
	if err != nil {
		return nil, err
	}
	return event, nil
}

func (s *Service) UpdateStatus(ctx context.Context, organizationID, documentID uuid.UUID, fromStatus, toStatus, processingStatus, actorType, actorID, eventType string, metadata map[string]any) error {
	now := time.Now().UTC()
	meta, _ := json.Marshal(metadata)
	if meta == nil {
		meta = []byte(`{}`)
	}

	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		var completedAt any
		if IsTerminalStatus(toStatus) {
			completedAt = now
		}
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = coalesce($5, completed_at),
			    updated_at = $6,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $7
		`, organizationID, documentID, toStatus, processingStatus, completedAt, now, fromStatus)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}

		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, eventType, fromStatus, toStatus, actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}

		outboxType := eventType
		if outboxType == "" {
			outboxType = messaging.EventDocumentStatusChanged
		}
		outboxData := map[string]any{
			"document_id": documentID,
			"from_status": fromStatus,
			"to_status":   toStatus,
			"status":      toStatus,
		}
		for k, v := range metadata {
			outboxData[k] = v
		}
		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, outboxType, outboxData)
		return err
	})
}

// ApplyTransmissionResult persists authorization columns on organization_nfe
// or organization_nfse and advances the document status with a webhook-ready
// outbox payload (serie, numero, access_key, protocol, cstat, x_motivo).
func (s *Service) ApplyTransmissionResult(ctx context.Context, doc Document, toStatus, processingStatus string, result TransmissionResult) error {
	eventType := EventTypeForOutcome(result.Outcome)
	now := time.Now().UTC()

	meta := map[string]any{}
	code := strings.TrimSpace(result.CStat)
	if code == "" {
		code = strings.TrimSpace(result.ErrorCode)
	}
	motivo := strings.TrimSpace(result.XMotivo)
	if motivo == "" {
		motivo = strings.TrimSpace(result.ErrorMessage)
	}
	if code != "" {
		meta["cstat"] = code
		meta["error_code"] = code
	}
	if motivo != "" {
		meta["x_motivo"] = motivo
		meta["error_message"] = motivo
	}
	if result.ErrorMessage != "" && result.ErrorMessage != motivo {
		meta["error_message"] = result.ErrorMessage
	}
	if result.Protocol != "" {
		meta["protocol"] = result.Protocol
	}
	if result.AccessKey != "" {
		meta["access_key"] = result.AccessKey
	}
	if result.RequestObjectKey != "" {
		meta["request_object_key"] = result.RequestObjectKey
	}
	if result.ResponseObjectKey != "" {
		meta["response_object_key"] = result.ResponseObjectKey
		meta["sefaz_response_object_key"] = result.ResponseObjectKey
	}

	return s.pool.WithTenant(ctx, doc.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var completedAt any
		if IsTerminalStatus(toStatus) {
			completedAt = now
		}
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = coalesce($5, completed_at),
			    updated_at = $6,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $7
		`, doc.OrganizationID, doc.ID, toStatus, processingStatus, completedAt, now, doc.Status)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}

		var authorizedAt any
		if result.Outcome == "authorized" {
			authorizedAt = now
		}

		var series, number *string
		if doc.DocumentType == "nfse" {
			_, err = tx.Exec(ctx, `
				update organization_nfse
				set access_key = coalesce(nullif($3, ''), access_key),
				    dps_id = coalesce(nullif($4, ''), dps_id),
				    nfse_number = coalesce(nullif($5, ''), nfse_number),
				    verification_code = coalesce(nullif($6, ''), verification_code),
				    authorization_status = coalesce(nullif($7, ''), authorization_status),
				    authorization_code = coalesce(nullif($8, ''), authorization_code),
				    authorization_message = coalesce(nullif($9, ''), authorization_message),
				    authorized_at = coalesce($10, authorized_at)
				where organization_document_id = $1 and organization_id = $2
			`, doc.ID, doc.OrganizationID, result.AccessKey, result.Protocol, result.Number,
				result.VerificationCode, result.Outcome, code, motivo, authorizedAt)
			if err != nil {
				return err
			}
			_ = tx.QueryRow(ctx, `
				select rps_series, coalesce(nfse_number, rps_number) from organization_nfse
				where organization_document_id = $1 and organization_id = $2
			`, doc.ID, doc.OrganizationID).Scan(&series, &number)
			if result.Outcome == "authorized" {
				if err := s.markSubstitutedOriginalTx(ctx, tx, doc, result.AccessKey, now); err != nil {
					return err
				}
			}
		} else {
			_, err = tx.Exec(ctx, `
				update organization_nfe
				set access_key = coalesce(nullif($3, ''), access_key),
				    authorization_protocol = coalesce(nullif($4, ''), authorization_protocol),
				    authorization_cstat = coalesce(nullif($5, ''), authorization_cstat),
				    authorization_xmotivo = coalesce(nullif($6, ''), authorization_xmotivo),
				    authorized_at = coalesce($7, authorized_at)
				where organization_document_id = $1 and organization_id = $2
			`, doc.ID, doc.OrganizationID, result.AccessKey, result.Protocol, code, motivo, authorizedAt)
			if err != nil {
				return err
			}
			_ = tx.QueryRow(ctx, `
				select series, number from organization_nfe
				where organization_document_id = $1 and organization_id = $2
			`, doc.ID, doc.OrganizationID).Scan(&series, &number)
		}

		metaBytes, _ := json.Marshal(meta)
		if metaBytes == nil {
			metaBytes = []byte(`{}`)
		}
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,'provider','nfe_gateway',$7,$8)
		`, ids.New(), doc.OrganizationID, doc.ID, eventType, doc.Status, toStatus, metaBytes, now)
		if err != nil {
			return err
		}

		outboxData := map[string]any{
			"document_id": doc.ID,
			"from_status": doc.Status,
			"to_status":   toStatus,
			"status":      toStatus,
		}
		if series != nil {
			outboxData["serie"] = *series
		}
		if number != nil {
			outboxData["numero"] = *number
		}
		for k, v := range meta {
			outboxData[k] = v
		}
		if _, err = messaging.InsertOutbox(ctx, tx, doc.OrganizationID, "organization_documents", doc.ID, eventType, outboxData); err != nil {
			return err
		}

		requestKey := strings.TrimSpace(result.RequestObjectKey)
		responseKey := strings.TrimSpace(result.ResponseObjectKey)
		if requestKey == "" || responseKey == "" {
			if originalKey, keyErr := originalPayloadObjectKeyTx(ctx, tx, doc.ID); keyErr == nil && originalKey != "" {
				if requestKey == "" {
					requestKey = originalKey + ".provider_request.xml"
				}
				if responseKey == "" {
					responseKey = originalKey + ".sefaz_response.xml"
				}
			}
		}
		s.registerStoredPayload(ctx, tx, doc.OrganizationID, doc.ID, PayloadProviderRequest, requestKey, "application/xml")
		s.registerStoredPayload(ctx, tx, doc.OrganizationID, doc.ID, PayloadSefazResponse, responseKey, "application/xml")
		return nil
	})
}

// markSubstitutedOriginalTx cancels the NFS-e referenced by substituted_access_key
// when a substitute is authorized (SEFIN generates 105102 atomically with emit).
func (s *Service) markSubstitutedOriginalTx(ctx context.Context, tx pgx.Tx, substitute Document, substituteAccessKey string, now time.Time) error {
	var originalKey *string
	err := tx.QueryRow(ctx, `
		select nullif(trim(substituted_access_key), '')
		from organization_nfse
		where organization_id = $1 and organization_document_id = $2
	`, substitute.OrganizationID, substitute.ID).Scan(&originalKey)
	if err != nil || originalKey == nil || strings.TrimSpace(*originalKey) == "" {
		return nil
	}
	key := normalizeAccessKey(*originalKey)

	var originalID uuid.UUID
	var fromStatus string
	err = tx.QueryRow(ctx, `
		select d.id, d.status
		from organization_documents d
		join organization_nfse s on s.organization_document_id = d.id and s.organization_id = d.organization_id
		where d.organization_id = $1
		  and d.document_type = 'nfse'
		  and d.direction = 'outbound'
		  and upper(regexp_replace(coalesce(s.access_key, ''), '[^0-9A-Za-z]', '', 'g')) = $2
		  and d.id <> $3
		limit 1
	`, substitute.OrganizationID, key, substitute.ID).Scan(&originalID, &fromStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if strings.EqualFold(fromStatus, StatusCancelled) {
		return nil
	}

	tag, err := tx.Exec(ctx, `
		update organization_documents
		set status = $3,
		    processing_status = $4,
		    completed_at = coalesce(completed_at, $5),
		    updated_at = $5,
		    version = version + 1
		where organization_id = $1 and id = $2 and status = $6
	`, substitute.OrganizationID, originalID, StatusCancelled, ProcessingCompleted, now, fromStatus)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil
	}

	meta, _ := json.Marshal(map[string]any{
		"reason":                 "substitution",
		"substitute_document_id": substitute.ID,
		"substitute_access_key":  substituteAccessKey,
		"event":                  "105102",
	})
	_, err = tx.Exec(ctx, `
		insert into organization_document_events (
			id, organization_id, organization_document_id, event_type, from_status, to_status,
			actor_type, actor_id, metadata_json, occurred_at
		) values ($1,$2,$3,$4,$5,$6,'provider','nfe_gateway',$7,$8)
	`, ids.New(), substitute.OrganizationID, originalID, EventTypeForOutcome("cancelled"), fromStatus, StatusCancelled, meta, now)
	if err != nil {
		return err
	}
	_, err = messaging.InsertOutbox(ctx, tx, substitute.OrganizationID, "organization_documents", originalID, EventTypeForOutcome("cancelled"), map[string]any{
		"document_id":            originalID,
		"from_status":            fromStatus,
		"to_status":              StatusCancelled,
		"status":                 StatusCancelled,
		"reason":                 "substitution",
		"substitute_document_id": substitute.ID,
	})
	return err
}

// NFSeMunicipalityCode returns the IBGE municipality used for SEFIN routing.
func (s *Service) NFSeMunicipalityCode(ctx context.Context, organizationID, documentID uuid.UUID) (string, error) {
	var code *string
	err := s.pool.QueryRow(ctx, `
		select coalesce(nullif(provider_municipality_code, ''), nullif(municipality_code, ''), nullif(service_municipality_code, ''))
		from organization_nfse
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if code == nil {
		return "", nil
	}
	return strings.TrimSpace(*code), nil
}

// ResubmitOutbound requeues a rejected/failed outbound document for another
// transmission attempt (same original_request payload and RPS/nDPS).
func (s *Service) ResubmitOutbound(ctx context.Context, organizationID, documentID uuid.UUID, actorType, actorID string) (*Document, error) {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	if strings.ToLower(doc.Direction) != "outbound" {
		return nil, domainerr.Validation("not_outbound", "Only outbound documents can be resubmitted")
	}
	fromStatus := strings.ToLower(doc.Status)
	switch fromStatus {
	case StatusRejected, StatusFailed:
	default:
		return nil, domainerr.Conflict("document_not_resubmittable", "Only rejected or failed outbound documents can be resubmitted")
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = null,
			    updated_at = $5,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $6 and direction = 'outbound'
		`, organizationID, documentID, StatusReceived, ProcessingQueued, now, fromStatus)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}

		if doc.DocumentType == "nfse" {
			_, err = tx.Exec(ctx, `
				update organization_nfse
				set authorization_status = null,
				    authorization_code = null,
				    authorization_message = null,
				    authorized_at = null
				where organization_document_id = $1 and organization_id = $2
			`, documentID, organizationID)
		} else {
			_, err = tx.Exec(ctx, `
				update organization_nfe
				set authorization_protocol = null,
				    authorization_cstat = null,
				    authorization_xmotivo = null,
				    authorized_at = null
				where organization_document_id = $1 and organization_id = $2
			`, documentID, organizationID)
		}
		if err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"reason": "manual_resubmit",
		})
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, messaging.EventDocumentRetryScheduled, fromStatus, StatusReceived,
			actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}

		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, messaging.EventDocumentRetryScheduled, map[string]any{
			"document_id": documentID,
			"from_status": fromStatus,
			"to_status":   StatusReceived,
			"status":      StatusReceived,
			"reason":      "manual_resubmit",
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetDocument(ctx, organizationID, documentID)
}

func (s *Service) ClaimQueuedDocuments(ctx context.Context, limit int) ([]Document, error) {
	var docs []Document
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id, organization_id, organization_company_id, document_type, direction, environment,
			       external_id, source_system, source_document_id, idempotency_key, document_key,
			       status, processing_status, current_version, correlation_id, trace_id,
			       received_at, completed_at, created_at, updated_at
			from organization_documents
			where processing_status in ('queued','retry_scheduled') and status = 'received' and direction = 'outbound'
			order by received_at
			limit $1
			for update skip locked
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var d Document
			if err := rows.Scan(
				&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.DocumentType, &d.Direction, &d.Environment,
				&d.ExternalID, &d.SourceSystem, &d.SourceDocumentID, &d.IdempotencyKey, &d.DocumentKey,
				&d.Status, &d.ProcessingStatus, &d.CurrentVersion, &d.CorrelationID, &d.TraceID,
				&d.ReceivedAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
			); err != nil {
				return err
			}
			docs = append(docs, d)
		}

		for _, d := range docs {
			_, err := tx.Exec(ctx, `
				update organization_documents
				set processing_status = 'processing', updated_at = now(), version = version + 1
				where id = $1
			`, d.ID)
			if err != nil {
				return err
			}
		}
		return nil
	})
	return docs, err
}

// FindInboundNFeByAccessKey returns the most recent inbound NF-e in the
// organization that already carries this access key, regardless of how it
// arrived (SEFAZ distribution, inbound API, or a previous manual upload).
// Manual XML upload uses this to reject a second import of the same note.
func (s *Service) FindInboundNFeByAccessKey(ctx context.Context, organizationID uuid.UUID, accessKey string) (*Document, error) {
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
		  and d.direction = 'inbound'
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

func (s *Service) findByIdempotency(ctx context.Context, organizationID, companyID uuid.UUID, sourceSystem, key string) (*Document, error) {
	doc, err := s.scanDocument(ctx, `
		select id, organization_id, organization_company_id, document_type, direction, environment,
		       external_id, source_system, source_document_id, idempotency_key, document_key,
		       status, processing_status, current_version, correlation_id, trace_id,
		       received_at, completed_at, created_at, updated_at
		from organization_documents
		where organization_id = $1 and organization_company_id = $2 and source_system = $3 and idempotency_key = $4
	`, organizationID, companyID, sourceSystem, key)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "document_not_found" {
			return nil, nil
		}
		return nil, err
	}
	return doc, nil
}

func (s *Service) sameRequestHash(ctx context.Context, documentID uuid.UUID, hash string) (bool, error) {
	var stored string
	err := s.pool.QueryRow(ctx, `
		select sha256 from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at asc limit 1
	`, documentID).Scan(&stored)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return stored == hash, nil
}

func (s *Service) scanDocument(ctx context.Context, query string, args ...any) (*Document, error) {
	row := s.pool.QueryRow(ctx, query, args...)
	var d Document
	if err := row.Scan(
		&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.DocumentType, &d.Direction, &d.Environment,
		&d.ExternalID, &d.SourceSystem, &d.SourceDocumentID, &d.IdempotencyKey, &d.DocumentKey,
		&d.Status, &d.ProcessingStatus, &d.CurrentVersion, &d.CorrelationID, &d.TraceID,
		&d.ReceivedAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("document_not_found", "Document not found")
		}
		return nil, err
	}
	return &d, nil
}

func nullEmpty(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte(`{}`)
	}
	return b
}
