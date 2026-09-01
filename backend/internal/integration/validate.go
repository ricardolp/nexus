package integration

import (
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

var allowedIntegrationTypes = map[string]struct{}{
	TypeSAPCPI:     {},
	TypeSAPS4:      {},
	TypeSAPECC:     {},
	TypeFiscalProv: {},
	TypeCustomHTTP: {},
}

var allowedEnvironments = map[string]struct{}{
	"production":   {},
	"homologation": {},
}

var allowedStatuses = map[string]struct{}{
	StatusActive:   {},
	StatusDisabled: {},
	StatusError:    {},
}

func validateCreateInput(in CreateInput) error {
	if strings.TrimSpace(in.Name) == "" {
		return domainerr.Validation("invalid_integration", "name is required")
	}
	if _, ok := allowedIntegrationTypes[in.IntegrationType]; !ok {
		return domainerr.Validation("invalid_integration_type", "unsupported integration_type: "+in.IntegrationType)
	}
	if _, ok := allowedEnvironments[in.Environment]; !ok {
		return domainerr.Validation("invalid_environment", "environment must be production or homologation")
	}
	if strings.TrimSpace(in.BaseURL) == "" {
		return domainerr.Validation("invalid_integration", "base_url is required")
	}
	return nil
}
