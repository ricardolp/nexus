package inbound

import (
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/integration"
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
}

func NewService(pool *db.Pool, fiscalSvc *fiscal.Service, orgs *organization.Service, integrations *integration.Service) *Service {
	return &Service{pool: pool, fiscal: fiscalSvc, orgs: orgs, integrations: integrations}
}
