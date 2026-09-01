package messaging

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	EventDocumentReceived      = "fiscal.document.received.v1"
	EventDocumentStatusChanged = "fiscal.document.status_changed.v1"
	EventWebhookDeliver        = "webhook.delivery_requested.v1"
	EventUserInvited           = "identity.user_invited.v1"
	EventPasswordResetRequested = "identity.password_reset_requested.v1"

	// EventDocumentTransmissionRequested/Result are the outbound handoff to
	// the nfe-gateway service (Python/PyNFe) and its reply — see
	// docs/architecture/22_nfe_gateway_service.md. Requested is published by
	// fiscal.MessagingProvider.Transmit; Result is consumed by
	// fiscal.Worker.HandleTransmissionResult.
	EventDocumentTransmissionRequested = "fiscal.document.transmission_requested.v1"
	EventDocumentTransmissionResult    = "fiscal.document.transmission_result.v1"

	// EventDocumentQueryRequested/Result are the on-demand SEFAZ query
	// handoff to nfe-gateway (consulta por NSU/chave/lote, disparada pelo
	// usuário na tela de notas fiscais) — distinta do poller automático de
	// distribuição. Requested is published by fiscal.QueryService.Create;
	// Result is consumed by fiscal.QueryConsumer.HandleQueryResult.
	EventDocumentQueryRequested = "fiscal.document.query_requested.v1"
	EventDocumentQueryResult    = "fiscal.document.query_result.v1"
)

type CloudEvent struct {
	SpecVersion     string          `json:"specversion"`
	ID              uuid.UUID       `json:"id"`
	Source          string          `json:"source"`
	Type            string          `json:"type"`
	Subject         string          `json:"subject"`
	Time            time.Time       `json:"time"`
	DataContentType string          `json:"datacontenttype"`
	OrganizationID  uuid.UUID       `json:"organization_id"`
	Data            json.RawMessage `json:"data"`
}

// NewCloudEvent builds a CloudEvents 1.0 compatible envelope.
func NewCloudEvent(eventID, organizationID, aggregateID uuid.UUID, source, eventType, aggregateType string, data any) (CloudEvent, []byte, error) {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return CloudEvent{}, nil, err
	}
	envelope := CloudEvent{
		SpecVersion:     "1.0",
		ID:              eventID,
		Source:          source,
		Type:            eventType,
		Subject:         aggregateType + "/" + aggregateID.String(),
		Time:            time.Now().UTC(),
		DataContentType: "application/json",
		OrganizationID:  organizationID,
		Data:            dataBytes,
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		return CloudEvent{}, nil, err
	}
	return envelope, payload, nil
}
