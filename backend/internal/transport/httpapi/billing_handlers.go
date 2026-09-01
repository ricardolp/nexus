package httpapi

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) getBillingStatement(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.Billing == nil {
		writeErr(w, r, domainerr.New(http.StatusInternalServerError, "billing_unavailable", "Internal Server Error", "Billing service is not configured"))
		return
	}
	stmt, err := a.Billing.GetStatement(r.Context(), orgID, r.URL.Query().Get("from"), r.URL.Query().Get("to"), time.Now())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, stmt)
}

func (a *ControlPlane) downloadBillingStatementPDF(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if a.Billing == nil {
		writeErr(w, r, domainerr.New(http.StatusInternalServerError, "billing_unavailable", "Internal Server Error", "Billing service is not configured"))
		return
	}
	stmt, err := a.Billing.GetStatement(r.Context(), orgID, r.URL.Query().Get("from"), r.URL.Query().Get("to"), time.Now())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	body, filename, err := a.Billing.RenderPDF(stmt)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
