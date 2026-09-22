package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) listMaterials(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe:read", "nfe_inbound:read", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if code := r.URL.Query().Get("code"); code != "" {
		item, err := a.Orgs.GetMaterialByCode(r.Context(), orgID, code)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{item}})
		return
	}
	items, err := a.Orgs.ListMaterials(r.Context(), orgID, r.URL.Query().Get("q"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getMaterial(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	materialID, err := uuid.Parse(chi.URLParam(r, "material_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_material_id", "Invalid material_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe:read", "nfe_inbound:read", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	item, err := a.Orgs.GetMaterial(r.Context(), orgID, materialID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) createMaterial(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe_inbound:manage", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		MaterialCode         string `json:"material_code"`
		SupplierMaterialCode string `json:"supplier_material_code"`
		Description          string `json:"description"`
		BaseUnit             string `json:"base_unit"`
		NCM                  string `json:"ncm"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	item, err := a.Orgs.CreateMaterial(r.Context(), organization.CreateMaterialInput{
		OrganizationID:       orgID,
		MaterialCode:         body.MaterialCode,
		SupplierMaterialCode: body.SupplierMaterialCode,
		Description:          body.Description,
		BaseUnit:             body.BaseUnit,
		NCM:                  body.NCM,
		ActorUserID:          p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, item)
}

func (a *ControlPlane) updateMaterial(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	materialID, err := uuid.Parse(chi.URLParam(r, "material_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_material_id", "Invalid material_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe_inbound:manage", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Description          string `json:"description"`
		BaseUnit             string `json:"base_unit"`
		NCM                  string `json:"ncm"`
		SupplierMaterialCode string `json:"supplier_material_code"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	item, err := a.Orgs.UpdateMaterial(r.Context(), organization.UpdateMaterialInput{
		OrganizationID:       orgID,
		MaterialID:           materialID,
		Description:          body.Description,
		BaseUnit:             body.BaseUnit,
		NCM:                  body.NCM,
		SupplierMaterialCode: body.SupplierMaterialCode,
		ActorUserID:          p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) createMaterialUOM(w http.ResponseWriter, r *http.Request) {
	orgID, materialID, err := parseOrgAndMaterial(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe_inbound:manage", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	in, err := decodeMaterialUOMBody(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	in.OrganizationID = orgID
	in.MaterialID = materialID
	in.ActorUserID = p.UserID
	item, err := a.Orgs.CreateMaterialUOM(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, item)
}

func (a *ControlPlane) updateMaterialUOM(w http.ResponseWriter, r *http.Request) {
	orgID, materialID, err := parseOrgAndMaterial(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	uomID, err := uuid.Parse(chi.URLParam(r, "uom_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_uom_id", "Invalid uom_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe_inbound:manage", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	in, err := decodeMaterialUOMBody(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	in.OrganizationID = orgID
	in.MaterialID = materialID
	in.UOMID = uomID
	in.ActorUserID = p.UserID
	item, err := a.Orgs.UpdateMaterialUOM(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) deleteMaterialUOM(w http.ResponseWriter, r *http.Request) {
	orgID, materialID, err := parseOrgAndMaterial(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	uomID, err := uuid.Parse(chi.URLParam(r, "uom_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_uom_id", "Invalid uom_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfe_inbound:manage", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	if err := a.Orgs.DeleteMaterialUOM(r.Context(), orgID, materialID, uomID, p.UserID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseOrgAndMaterial(r *http.Request) (uuid.UUID, uuid.UUID, error) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_organization_id", "Invalid organization_id")
	}
	materialID, err := uuid.Parse(chi.URLParam(r, "material_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_material_id", "Invalid material_id")
	}
	return orgID, materialID, nil
}

func decodeMaterialUOMBody(r *http.Request) (organization.UpsertMaterialUOMInput, error) {
	var body struct {
		AlternativeUnit string   `json:"alternative_unit"`
		BaseUnit        string   `json:"base_unit"`
		Numerator       *float64 `json:"numerator"`
		Denominator     *float64 `json:"denominator"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		return organization.UpsertMaterialUOMInput{}, domainerr.Validation("invalid_json", "Invalid JSON body")
	}
	in := organization.UpsertMaterialUOMInput{
		AlternativeUnit: body.AlternativeUnit,
		BaseUnit:        body.BaseUnit,
		Numerator:       1,
		Denominator:     1,
	}
	if body.Numerator != nil {
		in.Numerator = *body.Numerator
	}
	if body.Denominator != nil {
		in.Denominator = *body.Denominator
	}
	return in, nil
}
