package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/cnpja"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) lookupCNPJ(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfse:create", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	cnpj := chi.URLParam(r, "cnpj")
	summary, err := cnpja.NewClient().LookupOffice(r.Context(), cnpj)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, summary)
}

func (a *ControlPlane) listCustomers(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfse:read", "nfe:read", "nfe_inbound:read", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	includeHistory := true
	if v := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("include_history"))); v == "0" || v == "false" {
		includeHistory = false
	}
	if strings.TrimSpace(r.URL.Query().Get("saved_only")) == "1" {
		includeHistory = false
	}
	items, err := a.Orgs.ListCustomers(r.Context(), orgID, r.URL.Query().Get("q"), includeHistory)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getCustomer(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "customer_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_customer_id", "Invalid customer_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfse:read", "nfe:read", "nfe_inbound:read", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	customer, err := a.Orgs.GetCustomer(r.Context(), orgID, customerID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, customer)
}

func (a *ControlPlane) createCustomer(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfse:create", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		CPF                   string `json:"cpf"`
		CNPJ                  string `json:"cnpj"`
		NIF                   string `json:"nif"`
		LegalName             string `json:"legal_name"`
		Email                 string `json:"email"`
		Phone                 string `json:"phone"`
		MunicipalRegistration string `json:"municipal_registration"`
		Street                string `json:"street"`
		StreetType            string `json:"street_type"`
		Number                string `json:"number"`
		Complement            string `json:"complement"`
		District              string `json:"district"`
		MunicipalityCode      string `json:"municipality_code"`
		UF                    string `json:"uf"`
		CEP                   string `json:"cep"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	customer, err := a.Orgs.CreateCustomer(r.Context(), organization.CreateCustomerInput{
		OrganizationID:        orgID,
		CPF:                   body.CPF,
		CNPJ:                  body.CNPJ,
		NIF:                   body.NIF,
		LegalName:             body.LegalName,
		Email:                 body.Email,
		Phone:                 body.Phone,
		MunicipalRegistration: body.MunicipalRegistration,
		Street:                body.Street,
		StreetType:            body.StreetType,
		Number:                body.Number,
		Complement:            body.Complement,
		District:              body.District,
		MunicipalityCode:      body.MunicipalityCode,
		UF:                    body.UF,
		CEP:                   body.CEP,
		ActorUserID:           p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, customer)
}

func (a *ControlPlane) updateCustomer(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "customer_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_customer_id", "Invalid customer_id"))
		return
	}
	if err := a.ensureAnyOrganizationPermission(r, orgID, "nfse:create", "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		LegalName             string `json:"legal_name"`
		Email                 string `json:"email"`
		Phone                 string `json:"phone"`
		MunicipalRegistration string `json:"municipal_registration"`
		Street                string `json:"street"`
		StreetType            string `json:"street_type"`
		Number                string `json:"number"`
		Complement            string `json:"complement"`
		District              string `json:"district"`
		MunicipalityCode      string `json:"municipality_code"`
		UF                    string `json:"uf"`
		CEP                   string `json:"cep"`
		Status                string `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	customer, err := a.Orgs.UpdateCustomer(r.Context(), organization.UpdateCustomerInput{
		OrganizationID:        orgID,
		CustomerID:            customerID,
		LegalName:             body.LegalName,
		Email:                 body.Email,
		Phone:                 body.Phone,
		MunicipalRegistration: body.MunicipalRegistration,
		Street:                body.Street,
		StreetType:            body.StreetType,
		Number:                body.Number,
		Complement:            body.Complement,
		District:              body.District,
		MunicipalityCode:      body.MunicipalityCode,
		UF:                    body.UF,
		CEP:                   body.CEP,
		Status:                body.Status,
		ActorUserID:           p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, customer)
}

func (a *ControlPlane) listCompanyNFSeServices(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Orgs.ListCompanyNFSeServices(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) createCompanyNFSeService(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	in, err := decodeNFSeServiceBody(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	in.OrganizationID = orgID
	in.CompanyID = companyID
	in.ActorUserID = p.UserID
	item, err := a.Orgs.CreateCompanyNFSeService(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, item)
}

func (a *ControlPlane) updateCompanyNFSeService(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	serviceID, err := uuid.Parse(chi.URLParam(r, "nfse_service_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_nfse_service_id", "Invalid nfse_service_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	in, err := decodeNFSeServiceBody(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	in.OrganizationID = orgID
	in.CompanyID = companyID
	in.ServiceID = serviceID
	in.ActorUserID = p.UserID
	item, err := a.Orgs.UpdateCompanyNFSeService(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) deleteCompanyNFSeService(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	serviceID, err := uuid.Parse(chi.URLParam(r, "nfse_service_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_nfse_service_id", "Invalid nfse_service_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	if err := a.Orgs.DeleteCompanyNFSeService(r.Context(), orgID, companyID, serviceID, p.UserID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func decodeNFSeServiceBody(r *http.Request) (organization.UpsertCompanyNFSeServiceInput, error) {
	var body struct {
		CNAECode              string   `json:"cnae_code"`
		CNAEDescription       string   `json:"cnae_description"`
		ServiceListItem       string   `json:"service_list_item"`
		ServiceDescription    string   `json:"service_description"`
		NBSCode               string   `json:"nbs_code"`
		NBSDescription        string   `json:"nbs_description"`
		DefaultISSAliquot     *float64 `json:"default_iss_aliquot"`
		DefaultDiscrimination string   `json:"default_discrimination"`
		IsPrimary             bool     `json:"is_primary"`
		IsFavorite            bool     `json:"is_favorite"`
		SortOrder             int      `json:"sort_order"`
		Status                string   `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		return organization.UpsertCompanyNFSeServiceInput{}, domainerr.Validation("invalid_json", "Invalid JSON body")
	}
	return organization.UpsertCompanyNFSeServiceInput{
		CNAECode:              body.CNAECode,
		CNAEDescription:       body.CNAEDescription,
		ServiceListItem:       body.ServiceListItem,
		ServiceDescription:    body.ServiceDescription,
		NBSCode:               body.NBSCode,
		NBSDescription:        body.NBSDescription,
		DefaultISSAliquot:     body.DefaultISSAliquot,
		DefaultDiscrimination: body.DefaultDiscrimination,
		IsPrimary:             body.IsPrimary,
		IsFavorite:            body.IsFavorite,
		SortOrder:             body.SortOrder,
		Status:                body.Status,
	}, nil
}
