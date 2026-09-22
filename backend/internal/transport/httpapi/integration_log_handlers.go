package httpapi

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integrationlog"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) listIntegrationLogs(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.IntegrationLogs == nil {
		writeErr(w, r, domainerr.New(503, "integration_logs_unconfigured", "Service Unavailable", "integration logs are not configured"))
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	result, err := a.IntegrationLogs.List(r.Context(), integrationlog.ListInput{
		OrganizationID: orgID,
		Level:          r.URL.Query().Get("level"),
		Direction:      r.URL.Query().Get("direction"),
		Query:          r.URL.Query().Get("q"),
		Page:           page,
		Limit:          limit,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (a *ControlPlane) getIntegrationLog(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	logID, err := uuid.Parse(chi.URLParam(r, "log_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_log_id", "Invalid log_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.IntegrationLogs == nil {
		writeErr(w, r, domainerr.New(503, "integration_logs_unconfigured", "Service Unavailable", "integration logs are not configured"))
		return
	}
	item, err := a.IntegrationLogs.Get(r.Context(), orgID, logID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}
