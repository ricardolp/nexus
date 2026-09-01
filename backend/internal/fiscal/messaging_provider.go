package fiscal

import (
	"context"

	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/broker"
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
type MessagingProvider struct {
	docs *Service
	bus  broker.Publisher
}

func NewMessagingProvider(docs *Service, bus broker.Publisher) *MessagingProvider {
	return &MessagingProvider{docs: docs, bus: bus}
}

func (p *MessagingProvider) Transmit(ctx context.Context, doc Document) (ProviderResult, error) {
	objectKey, err := p.docs.OriginalPayloadObjectKey(ctx, doc.ID)
	if err != nil {
		return ProviderResult{}, err
	}

	_, payload, err := messaging.NewCloudEvent(
		ids.New(), doc.OrganizationID, doc.ID,
		"fiscal_worker", messaging.EventDocumentTransmissionRequested, "organization_documents",
		map[string]any{
			"document_id":             doc.ID,
			"organization_company_id": doc.OrganizationCompanyID,
			"environment":             doc.Environment,
			"payload_object_key":      objectKey,
		},
	)
	if err != nil {
		return ProviderResult{}, err
	}
	if err := p.bus.Publish(ctx, messaging.EventDocumentTransmissionRequested, payload); err != nil {
		return ProviderResult{}, err
	}

	return ProviderResult{Outcome: "submitted", Provider: "nfe_gateway"}, nil
}
