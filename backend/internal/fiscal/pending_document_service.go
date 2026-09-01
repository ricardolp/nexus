package fiscal

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// PendingDocumentService is the read side (List) plus the one write this
// package is allowed to make: enqueueing a ManifestationRequest. Everything
// else about nfe_pending_manifestation_documents (creating/updating rows)
// is the nfe-gateway's job — see migration 019's comment.
type PendingDocumentService struct {
	pool *db.Pool
	orgs *organization.Service
}

func NewPendingDocumentService(pool *db.Pool, orgs *organization.Service) *PendingDocumentService {
	return &PendingDocumentService{pool: pool, orgs: orgs}
}

func (s *PendingDocumentService) List(ctx context.Context, organizationID uuid.UUID, limit int) ([]PendingDocument, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, chave, nsu, schema,
		       cnpj_emitente, nome_emitente, valor, data_emissao, protocolo, situacao,
		       status, error_message, created_at, manifested_at
		from nfe_pending_manifestation_documents
		where organization_id = $1
		order by created_at desc
		limit $2
	`, organizationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PendingDocument{}
	for rows.Next() {
		var d PendingDocument
		if err := rows.Scan(&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.Chave, &d.NSU, &d.Schema,
			&d.CNPJEmitente, &d.NomeEmitente, &d.Valor, &d.DataEmissao, &d.Protocolo, &d.Situacao,
			&d.Status, &d.ErrorMessage, &d.CreatedAt, &d.ManifestedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// RequestManifestation enqueues a Ciência da Operação send for one pending
// document — deliberately one row at a time (no bulk mode): sending Ciência
// is a real act with SEFAZ, not a bulk-safe housekeeping operation, so each
// one should trace back to a specific user click. Rejects a pending_document
// that's already manifested/manifesting, or already has a request in flight,
// so a double-click can't queue duplicate sends.
func (s *PendingDocumentService) RequestManifestation(ctx context.Context, organizationID, organizationCompanyID, pendingDocumentID, requestedByUserID uuid.UUID) (*ManifestationRequest, error) {
	if _, err := s.orgs.GetCompany(ctx, organizationID, organizationCompanyID); err != nil {
		return nil, err
	}

	var status string
	err := s.pool.QueryRow(ctx, `
		select status from nfe_pending_manifestation_documents
		where id = $1 and organization_id = $2 and organization_company_id = $3
	`, pendingDocumentID, organizationID, organizationCompanyID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("pending_document_not_found", "Pending document not found")
	}
	if err != nil {
		return nil, err
	}
	// 'error' is retryable (e.g. a real rejection like the cOrgao mismatch
	// caught live 2026-08-17 — fixed, but any future transient/real SEFAZ
	// rejection should be retriable without needing a new query first).
	// 'manifesting'/'manifested' are not: the first is already in flight,
	// the second doesn't need Ciência sent again.
	if status != PendingDocumentStatusPending && status != PendingDocumentStatusError {
		return nil, domainerr.Validation("not_pending", "This document is not awaiting Ciência (status: "+status+")")
	}

	now := time.Now().UTC()
	req := &ManifestationRequest{
		ID:                    ids.New(),
		OrganizationID:        organizationID,
		OrganizationCompanyID: organizationCompanyID,
		PendingDocumentID:     pendingDocumentID,
		RequestedByUserID:     requestedByUserID,
		Status:                ManifestationRequestStatusPending,
		CreatedAt:             now,
	}
	_, err = s.pool.Exec(ctx, `
		insert into nfe_manifestation_requests (
			id, organization_id, organization_company_id, pending_document_id,
			requested_by_user_id, status, created_at
		) values ($1,$2,$3,$4,$5,$6,$7)
	`, req.ID, req.OrganizationID, req.OrganizationCompanyID, req.PendingDocumentID,
		req.RequestedByUserID, req.Status, now)
	if err != nil {
		return nil, err
	}
	return req, nil
}
