package sap

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// Resolve picks the Adapter to use for a company: a real CPIClient if an
// active sap_cpi integration is configured (company-specific, falling back
// to the organization default), otherwise StubClient — mirrors the legacy
// getSapInboundAdapter fallback.
func Resolve(ctx context.Context, integrations *integration.Service, organizationID uuid.UUID, companyID *uuid.UUID) (Adapter, error) {
	row, err := integrations.ResolveActive(ctx, organizationID, companyID, integration.TypeSAPCPI)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "integration_not_found" {
			return NewStubClient(), nil
		}
		return nil, err
	}

	var cfg integration.Configuration
	if len(row.ConfigurationJSON) > 0 {
		if err := json.Unmarshal(row.ConfigurationJSON, &cfg); err != nil {
			return nil, err
		}
	}

	secret, err := integrations.DecryptSecret(ctx, organizationID, row.ID)
	if err != nil {
		return nil, err
	}

	baseURL := ""
	if row.BaseURL != nil {
		baseURL = *row.BaseURL
	}

	return NewCPIClient(baseURL, cfg.ClientID, secret, cfg.TokenURL, cfg.SAPClient, cfg.SAPLanguage, cfg.Headers, cfg.Capabilities), nil
}
