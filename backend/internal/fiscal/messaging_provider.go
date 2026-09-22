package fiscal

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/nexus/fiscal-messaging/internal/integrationlog"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/broker"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// MessagingProvider hands outbound transmission off to the nfe-gateway
// service (Python/PyNFe) via RabbitMQ instead of talking to SEFAZ
// in-process — Go has no NF-e signing/SOAP capability, see
// docs/architecture/22_nfe_gateway_service.md. Transmit only publishes
// fiscal.document.transmission_requested.v1 and returns immediately with
// outcome "submitted" (Worker.processOne already knows how to leave a
// document in StatusSubmitted/ProcessingWaiting for that outcome — no
// change needed there). Worker.HandleTransmissionResult applies the real
// outcome later, when the gateway replies.
//
// The payload in object storage is the SAP JSON (not XML). The gateway
// builds/signs the XML itself. For NF-e, UF is required to route the
// SEFAZ webservice; for NFS-e, municipality_code routes SEFIN Nacional.
type MessagingProvider struct {
	docs *Service
	orgs *organization.Service
	bus  broker.Publisher
	logs *integrationlog.Recorder
}

func NewMessagingProvider(docs *Service, bus broker.Publisher) *MessagingProvider {
	return &MessagingProvider{docs: docs, bus: bus}
}

// WithOrganizations wires company lookup so Transmit can include UF.
func (p *MessagingProvider) WithOrganizations(orgs *organization.Service) *MessagingProvider {
	p.orgs = orgs
	return p
}

func (p *MessagingProvider) WithIntegrationLog(rec *integrationlog.Recorder) *MessagingProvider {
	p.logs = rec
	return p
}

func (p *MessagingProvider) Transmit(ctx context.Context, doc Document) (ProviderResult, error) {
	objectKey, err := p.docs.OriginalPayloadObjectKey(ctx, doc.ID)
	if err != nil {
		return ProviderResult{}, err
	}

	data := map[string]any{
		"document_id":             doc.ID,
		"organization_company_id": doc.OrganizationCompanyID,
		"document_type":           doc.DocumentType,
		"environment":             doc.Environment,
		"payload_object_key":      objectKey,
		"payload_content_type":    "application/json",
	}

	if doc.DocumentType == "nfse" {
		municipio, err := p.docs.NFSeMunicipalityCode(ctx, doc.OrganizationID, doc.ID)
		if err != nil {
			return ProviderResult{}, err
		}
		if municipio != "" {
			data["municipality_code"] = municipio
		}
		// UF is optional for SEFIN; include when known for logging/routing hints.
		if uf, ufErr := p.resolveCompanyUFOptional(ctx, doc); ufErr == nil && uf != "" {
			data["uf"] = uf
		}
	} else {
		uf, err := p.resolveCompanyUF(ctx, doc)
		if err != nil {
			return ProviderResult{}, err
		}
		data["uf"] = uf
	}

	_, payload, err := messaging.NewCloudEvent(
		ids.New(), doc.OrganizationID, doc.ID,
		"fiscal_worker", messaging.EventDocumentTransmissionRequested, "organization_documents",
		data,
	)
	if err != nil {
		return ProviderResult{}, err
	}
	if err := p.bus.Publish(ctx, messaging.EventDocumentTransmissionRequested, payload); err != nil {
		return ProviderResult{}, err
	}

	p.recordHandoff(ctx, doc, objectKey, data)
	return ProviderResult{Outcome: "submitted", Provider: "nfe_gateway"}, nil
}

func (p *MessagingProvider) recordHandoff(ctx context.Context, doc Document, objectKey string, data map[string]any) {
	if p.logs == nil {
		return
	}
	now := time.Now().UTC()
	status := 202
	duration := 0
	orgID := doc.OrganizationID
	meta, _ := json.Marshal(data)
	dest := "nfe_gateway"
	summary := "transmission_requested " + doc.DocumentType + " " + doc.ID.String()
	p.logs.Record(ctx, integrationlog.Entry{
		OrganizationID:     &orgID,
		CorrelationID:      doc.CorrelationID,
		TraceID:            doc.TraceID,
		SpanName:           "outbound.nfe_gateway.handoff",
		Direction:          integrationlog.DirectionOutbound,
		Origin:             "nexus",
		Destination:        dest,
		Level:              integrationlog.LevelInfo,
		Summary:            summary,
		HTTPMethod:         "PUBLISH",
		HTTPPath:           messaging.EventDocumentTransmissionRequested,
		HTTPStatus:         &status,
		DurationMs:         &duration,
		StorageKey:         objectKey,
		RequestBodyPreview: integrationlog.TruncateBody(meta, integrationlog.DefaultBodyPreviewLimit),
		Metadata:           meta,
		StartedAt:          now,
		FinishedAt:         &now,
	})
}

func (p *MessagingProvider) resolveCompanyUF(ctx context.Context, doc Document) (string, error) {
	uf, err := p.resolveCompanyUFOptional(ctx, doc)
	if err != nil {
		return "", err
	}
	if uf == "" {
		return "", domainerr.Validation("missing_company_uf", "organization company UF is required before transmitting NF-e to SEFAZ")
	}
	return uf, nil
}

func (p *MessagingProvider) resolveCompanyUFOptional(ctx context.Context, doc Document) (string, error) {
	if p.orgs == nil {
		return "", domainerr.Validation("missing_company_uf", "organization service is required to resolve company UF for SEFAZ routing")
	}
	company, err := p.orgs.GetCompany(ctx, doc.OrganizationID, doc.OrganizationCompanyID)
	if err != nil {
		return "", err
	}
	if company.UF == nil || strings.TrimSpace(*company.UF) == "" {
		return "", nil
	}
	return strings.ToUpper(strings.TrimSpace(*company.UF)), nil
}
