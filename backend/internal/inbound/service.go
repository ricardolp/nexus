package inbound

import (
	"context"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
	"github.com/nexus/fiscal-messaging/internal/integrationlog"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
)

// Service is the orchestrator facade: scenario resolution, matching,
// validation, execution plan and the manual-correction endpoints are all
// methods on this type, built on top of the generic fiscal.Service envelope
// (organization_documents/organization_nfe) rather than duplicating it.
type Service struct {
	pool         *db.Pool
	fiscal       *fiscal.Service
	orgs         *organization.Service
	integrations *integration.Service
	logs         *integrationlog.Recorder
}

func NewService(pool *db.Pool, fiscalSvc *fiscal.Service, orgs *organization.Service, integrations *integration.Service) *Service {
	return &Service{pool: pool, fiscal: fiscalSvc, orgs: orgs, integrations: integrations}
}

func (s *Service) WithIntegrationLog(rec *integrationlog.Recorder) *Service {
	s.logs = rec
	return s
}

func (s *Service) resolveSAP(ctx context.Context, organizationID uuid.UUID, companyID *uuid.UUID) (sap.Adapter, error) {
	return sap.ResolveWithRecorder(ctx, s.integrations, organizationID, companyID, s.logs)
}
