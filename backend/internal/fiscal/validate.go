package fiscal

import (
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// NormalizeReceiveInput validates and normalizes inbound document fields.
func NormalizeReceiveInput(in ReceiveInput) (NormalizedReceive, error) {
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		return NormalizedReceive{}, domainerr.Validation("missing_idempotency_key", "Idempotency-Key is required")
	}
	if len(in.IdempotencyKey) > 255 {
		return NormalizedReceive{}, domainerr.Validation("invalid_idempotency_key", "Idempotency-Key must contain at most 255 characters")
	}
	docType := strings.ToLower(strings.TrimSpace(in.DocumentType))
	if docType != "nfe" && docType != "nfse" {
		return NormalizedReceive{}, domainerr.Validation("invalid_document_type", "document_type must be nfe or nfse")
	}

	direction := strings.ToLower(strings.TrimSpace(in.Direction))
	if direction == "" {
		direction = "outbound"
	}
	if direction != "inbound" && direction != "outbound" {
		return NormalizedReceive{}, domainerr.Validation("invalid_direction", "direction must be inbound or outbound")
	}

	if strings.TrimSpace(in.SourceSystem) == "" {
		return NormalizedReceive{}, domainerr.Validation("missing_source_system", "source_system is required")
	}
	if len(strings.TrimSpace(in.SourceSystem)) > 120 {
		return NormalizedReceive{}, domainerr.Validation("invalid_source_system", "source_system must contain at most 120 characters")
	}
	if len(in.Payload) == 0 {
		return NormalizedReceive{}, domainerr.Validation("missing_payload", "payload is required")
	}
	if in.Environment != "" && in.Environment != "production" && in.Environment != "homologation" {
		return NormalizedReceive{}, domainerr.Validation("invalid_environment", "environment must be production or homologation")
	}

	contentType := strings.TrimSpace(in.ContentType)
	if contentType == "" {
		contentType = "application/json"
	}
	if len(contentType) > 255 {
		return NormalizedReceive{}, domainerr.Validation("invalid_content_type", "content_type must contain at most 255 characters")
	}

	return NormalizedReceive{
		DocumentType: docType,
		Direction:    direction,
		ContentType:  contentType,
		ServiceCode:  ServiceCodeFor(docType, direction),
	}, nil
}

// ManifestationTypes mirrors SEFAZ's four manifestação do destinatário
// outcomes (NF-e technical note 2014.002). This only records the recipient's
// declared response in our own timeline — it does not transmit anything to
// SEFAZ.
var ManifestationTypes = map[string]bool{
	"ciencia_da_operacao":         true,
	"confirmacao_da_operacao":     true,
	"desconhecimento_da_operacao": true,
	"operacao_nao_realizada":      true,
}

func ValidateManifestationType(value string) (string, error) {
	manifestationType := strings.ToLower(strings.TrimSpace(value))
	if !ManifestationTypes[manifestationType] {
		return "", domainerr.Validation(
			"invalid_manifestation_type",
			"manifestation_type must be one of ciencia_da_operacao, confirmacao_da_operacao, desconhecimento_da_operacao, operacao_nao_realizada",
		)
	}
	return manifestationType, nil
}
