package httpapi

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) listPermissionCatalog(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": organization.PermissionCatalog})
}

func (a *ControlPlane) listRoles(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	roles, err := a.Orgs.ListRoles(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": roles})
}

func (a *ControlPlane) getRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "role_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_role_id", "Invalid role_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	role, err := a.Orgs.GetRole(r.Context(), orgID, roleID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, role)
}

func (a *ControlPlane) createRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "role:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Name        string   `json:"name"`
		Slug        string   `json:"slug"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	role, err := a.Orgs.CreateRole(r.Context(), organization.CreateRoleInput{
		OrganizationID: orgID, Name: body.Name, Slug: body.Slug, Description: body.Description,
		Permissions: body.Permissions, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, role)
}

func (a *ControlPlane) updateRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "role_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_role_id", "Invalid role_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "role:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	role, err := a.Orgs.UpdateRole(r.Context(), organization.UpdateRoleInput{
		OrganizationID: orgID, RoleID: roleID, Name: body.Name, Description: body.Description,
		Permissions: body.Permissions, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, role)
}

func (a *ControlPlane) deleteRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "role_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_role_id", "Invalid role_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "role:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	if err := a.Orgs.DeleteRole(r.Context(), organization.DeleteRoleInput{
		OrganizationID: orgID, RoleID: roleID, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) listMemberRoles(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "member_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_member_id", "Invalid member_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	roles, err := a.Orgs.ListMemberRoles(r.Context(), orgID, memberID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": roles})
}

func (a *ControlPlane) assignMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "member_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_member_id", "Invalid member_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "role:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		RoleID                string     `json:"role_id"`
		OrganizationCompanyID string     `json:"organization_company_id"`
		ValidUntil            *time.Time `json:"valid_until"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	roleID, err := uuid.Parse(body.RoleID)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_role_id", "role_id must be a valid UUID"))
		return
	}
	var companyID *uuid.UUID
	if body.OrganizationCompanyID != "" {
		id, err := uuid.Parse(body.OrganizationCompanyID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "Invalid organization_company_id"))
			return
		}
		companyID = &id
	}
	assignment, err := a.Orgs.AssignMemberRole(r.Context(), organization.AssignMemberRoleInput{
		OrganizationID: orgID, MemberID: memberID, RoleID: roleID,
		OrganizationCompanyID: companyID, ValidUntil: body.ValidUntil, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, assignment)
}

func (a *ControlPlane) removeMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "member_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_member_id", "Invalid member_id"))
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "role_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_role_id", "Invalid role_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "role:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var companyID *uuid.UUID
	if raw := r.URL.Query().Get("organization_company_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "Invalid organization_company_id"))
			return
		}
		companyID = &id
	}
	if err := a.Orgs.RemoveMemberRole(r.Context(), organization.RemoveMemberRoleInput{
		OrganizationID: orgID, MemberID: memberID, RoleID: roleID,
		OrganizationCompanyID: companyID, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
