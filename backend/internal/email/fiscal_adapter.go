package email

import (
	"context"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
)

// FiscalAdapter bridges fiscal.Service to FiscalReader.
type FiscalAdapter struct {
	svc *fiscal.Service
}

func NewFiscalAdapter(svc *fiscal.Service) *FiscalAdapter {
	return &FiscalAdapter{svc: svc}
}

func (a *FiscalAdapter) GetDocument(ctx context.Context, organizationID, documentID uuid.UUID) (*FiscalDocument, error) {
	doc, err := a.svc.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	return &FiscalDocument{
		ID:                    doc.ID,
		OrganizationID:        doc.OrganizationID,
		OrganizationCompanyID: doc.OrganizationCompanyID,
		DocumentType:          doc.DocumentType,
		Direction:             doc.Direction,
		Status:                doc.Status,
		DocumentKey:           doc.DocumentKey,
	}, nil
}

func (a *FiscalAdapter) DownloadOriginalPayload(ctx context.Context, organizationID, documentID uuid.UUID) (*PayloadDownload, error) {
	dl, err := a.svc.DownloadOriginalPayload(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	return &PayloadDownload{
		Data:        dl.Data,
		ContentType: dl.ContentType,
		Filename:    dl.Filename,
	}, nil
}
