package fiscal

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/notification"
)

// QueryConsumer applies the nfe-gateway's reply to an on-demand SEFAZ query
// (fiscal.document.query_result.v1). The gateway itself already wrote the
// authoritative outcome directly into fiscal_document_query_requests/_items
// (same split as organization_company_nfe_distribution_state — Python owns
// that bookkeeping, Go only reads it back here) and only ingested any found
// documents through the existing inbound HTTP pipeline. This consumer's one
// job is the piece only Go can do: turn "the request finished" into an
// in-app Notification for the user who asked for it.
type QueryConsumer struct {
	query         *QueryService
	notifications *notification.Service
}

func NewQueryConsumer(query *QueryService, notifications *notification.Service) *QueryConsumer {
	return &QueryConsumer{query: query, notifications: notifications}
}

type queryResultEvent struct {
	QueryRequestID uuid.UUID `json:"query_request_id"`
}

func (c *QueryConsumer) HandleQueryResult(ctx context.Context, payload []byte) error {
	var envelope messaging.CloudEvent
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return err
	}
	var evt queryResultEvent
	if err := json.Unmarshal(envelope.Data, &evt); err != nil {
		return err
	}

	req, err := c.query.Get(ctx, envelope.OrganizationID, evt.QueryRequestID)
	if err != nil {
		return err
	}
	if req.Status != QueryStatusCompleted && req.Status != QueryStatusFailed {
		// The gateway publishes this event only once the request is fully
		// resolved — if we somehow see it earlier (or a stale redelivery
		// races an in-progress row), there's nothing to notify about yet.
		return nil
	}

	claimed, err := c.query.claimForNotification(ctx, req.ID)
	if err != nil {
		return err
	}
	if !claimed {
		// Already notified on a previous delivery of this at-least-once event.
		return nil
	}

	title, body := summarizeQueryResult(req)
	_, err = c.notifications.Create(ctx, notification.CreateInput{
		UserID:         req.RequestedByUserID,
		OrganizationID: &req.OrganizationID,
		Type:           "fiscal.query_completed",
		Title:          title,
		Body:           body,
		Data: map[string]any{
			"query_request_id": req.ID,
			"query_type":       req.QueryType,
			"status":           req.Status,
		},
	})
	return err
}

func summarizeQueryResult(req *QueryRequestWithItems) (title, body string) {
	if req.Status == QueryStatusFailed {
		return "Consulta ao SEFAZ falhou", "Não foi possível concluir a consulta. Veja os detalhes na tela de notas fiscais."
	}

	found, notFound := 0, 0
	for _, item := range req.Items {
		switch item.Status {
		case QueryItemStatusFound:
			found++
		case QueryItemStatusNotFound:
			notFound++
		}
	}

	switch req.QueryType {
	case QueryTypeNSU:
		return "Consulta por NSU concluída", fmt.Sprintf("%d documento(s) encontrado(s).", found)
	case QueryTypeChave:
		if found > 0 {
			return "Nota localizada", "A nota consultada foi encontrada e adicionada ao sistema."
		}
		return "Nota não localizada", "A nota não foi encontrada na distribuição do SEFAZ — isso é esperado para documentos emitidos há mais de ~90 dias, que precisam ser importados manualmente."
	default: // batch
		return "Consulta em lote concluída", fmt.Sprintf("%d nota(s) localizada(s), %d não encontrada(s).", found, notFound)
	}
}
