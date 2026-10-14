package fiscal

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integrationlog"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/nfseprovider"
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
	docs   *Service
	orgs   *organization.Service
	bus    broker.Publisher
	logs   *integrationlog.Recorder
	routes NFSeRouteResolver
}

// NFSeRouteResolver decide o provedor municipal de NFS-e (catálogo
// nfse_municipal_providers + settings da empresa). Implementado por
// *nfseprovider.Service.
type NFSeRouteResolver interface {
	Resolve(ctx context.Context, organizationID, companyID uuid.UUID, municipalityCode string) (nfseprovider.Route, error)
	HasCredentials(ctx context.Context, organizationID, companyID uuid.UUID, providerCode string) (bool, error)
}

// WithNFSeProviders liga o roteamento por município. Sem ele toda NFS-e vai
// para a SEFIN Nacional (comportamento anterior).
func (p *MessagingProvider) WithNFSeProviders(routes NFSeRouteResolver) *MessagingProvider {
	p.routes = routes
	return p
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
	code, message, err := p.docs.CertificateBlock(ctx, doc.OrganizationID, doc.OrganizationCompanyID)
	if err != nil {
		return ProviderResult{}, err
	}
	if code != "" {
		return ProviderResult{
			Outcome:      "error",
			Provider:     "nfe_gateway",
			ErrorCode:    code,
			ErrorMessage: message,
		}, nil
	}

	code, message, err = p.docs.RegistrationBlock(ctx, doc.OrganizationID, doc.ID)
	if err != nil {
		return ProviderResult{}, err
	}
	if code != "" {
		return ProviderResult{
			Outcome:      "error",
			Provider:     "nfe_gateway",
			ErrorCode:    code,
			ErrorMessage: message,
		}, nil
	}

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
		if p.routes != nil {
			route, err := p.routes.Resolve(ctx, doc.OrganizationID, doc.OrganizationCompanyID, municipio)
			if err != nil {
				var de *domainerr.Error
				if errors.As(err, &de) {
					return ProviderResult{Outcome: "error", Provider: "nfe_gateway", ErrorCode: de.Code, ErrorMessage: de.Detail}, nil
				}
				return ProviderResult{}, err
			}
			if desc, ok := nfseprovider.Lookup(route.ProviderCode); ok && desc.Credentials != nfseprovider.CredentialsNone {
				has, err := p.routes.HasCredentials(ctx, doc.OrganizationID, doc.OrganizationCompanyID, route.ProviderCode)
				if err != nil {
					return ProviderResult{}, err
				}
				if !has {
					return ProviderResult{
						Outcome:   "error",
						Provider:  "nfe_gateway",
						ErrorCode: "provider_credentials_missing",
						ErrorMessage: "Empresa sem usuário/senha do webservice municipal de NFS-e (" + desc.Name +
							"). Cadastre em Configurações → Empresas → NFS-e municipal.",
					}, nil
				}
			}
			if err := p.docs.SetNFSeProviderRoute(ctx, doc.OrganizationID, doc.ID, route.ProviderCode, route.Config); err != nil {
				return ProviderResult{}, err
			}
			data["nfse_provider"] = route.ProviderCode
			data["nfse_provider_config"] = route.Config
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
