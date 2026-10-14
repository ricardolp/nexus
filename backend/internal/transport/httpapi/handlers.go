package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/billing"
	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/email"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/integrationlog"
	"github.com/nexus/fiscal-messaging/internal/nfseprovider"
	"github.com/nexus/fiscal-messaging/internal/notification"
	"github.com/nexus/fiscal-messaging/internal/ops"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
	"github.com/nexus/fiscal-messaging/internal/platform/llm"
	"github.com/nexus/fiscal-messaging/internal/support"
	"github.com/nexus/fiscal-messaging/internal/webhook"
)

type ControlPlane struct {
	Identity         *identity.Service
	Orgs             *organization.Service
	Ops              *ops.Service
	IntegrationLogs  *integrationlog.Service
	Webhooks         *webhook.Service
	Certificates     *certificate.Service
	Notifications    *notification.Service
	Inbound          *inbound.Service
	Integrations     *integration.Service
	NFSeProviders    *nfseprovider.Service
	Fiscal           *fiscal.Service
	FiscalQueries    *fiscal.QueryService
	PendingDocuments *fiscal.PendingDocumentService
	Support          *support.Service
	Billing          *billing.Service
	Email            *email.Service
	Tokens           *auth.TokenService
	LLM              *llm.Client
}

func (a *ControlPlane) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Post("/v1/auth/login", a.login)
	r.Post("/v1/auth/mfa/verify", a.verifyMFALogin)
	r.Post("/v1/auth/refresh", a.refreshToken)
	r.Post("/v1/auth/password/forgot", a.forgotPassword)
	r.Post("/v1/auth/password/reset", a.resetPassword)
	r.Get("/v1/auth/invitations/password-policy", a.invitationPasswordPolicy)
	r.Post("/v1/auth/invitations/accept", a.acceptInvitation)
	r.Post("/v1/oauth/token", a.clientToken)

	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(a.Tokens))
		r.Use(auth.RequireUser)
		r.Use(a.sessionGuard)
		r.Get("/v1/users/me", a.me)
		r.Get("/v1/users/me/organizations", a.listMyOrganizations)
		r.Post("/v1/auth/switch-organization", a.switchOrganization)
		r.Patch("/v1/users/me", a.patchMe)
		r.Post("/v1/users/me/password", a.changePassword)
		r.Get("/v1/users/me/password-policy", a.myPasswordPolicy)
		r.Post("/v1/users/me/avatar", a.uploadAvatar)
		r.Delete("/v1/users/me/avatar", a.deleteAvatar)
		r.Get("/v1/users/me/avatar", a.getAvatar)
		r.Get("/v1/users/me/mfa", a.getMFA)
		r.Post("/v1/users/me/mfa/enroll", a.enrollMFA)
		r.Post("/v1/users/me/mfa/confirm", a.confirmMFA)
		r.Post("/v1/users/me/mfa/disable", a.disableMFA)
		r.Post("/v1/users/me/mfa/recovery-codes/regenerate", a.regenerateRecoveryCodes)
		r.Get("/v1/users/me/sessions", a.listSessions)
		r.Delete("/v1/users/me/sessions/{session_id}", a.revokeSession)
		r.Post("/v1/users/me/sessions/revoke-others", a.revokeOtherSessions)
		r.Get("/v1/users/me/security-events", a.listSecurityEvents)
		r.Post("/v1/auth/logout", a.logout)
		r.Post("/v1/users", a.inviteUser)
		r.Get("/v1/users", a.listUsers)
		r.Delete("/v1/users/{user_id}", a.deleteUser)
		r.Post("/v1/users/{user_id}/password", a.adminSetUserPassword)
		r.Get("/v1/users/{user_id}/security-events", a.adminListUserSecurityEvents)
		r.Get("/v1/users/{user_id}/audit-events", a.adminListUserAuditEvents)
		r.Get("/v1/users/{user_id}/organizations", a.listUserOrganizations)
		r.Post("/v1/organizations", a.createOrganization)
		r.Get("/v1/organizations", a.listOrganizations)
		r.Get("/v1/organizations/usage-stats", a.listOrganizationsUsage)
		r.Get("/v1/organizations/{organization_id}", a.getOrganization)
		r.Patch("/v1/organizations/{organization_id}", a.updateOrganization)
		r.Get("/v1/organizations/{organization_id}/companies/usage", a.listCompaniesUsage)
		r.Get("/v1/organizations/{organization_id}/billing/statement", a.getBillingStatement)
		r.Get("/v1/organizations/{organization_id}/billing/statement.pdf", a.downloadBillingStatementPDF)
		r.Get("/v1/request_traces", a.listRequestTraces)
		r.Get("/v1/request_traces/{trace_id}", a.getRequestTrace)
		r.Get("/v1/platform/errors", a.listPlatformErrors)
		r.Get("/v1/platform/status", a.getPlatformStatus)
		r.Get("/v1/organizations/{organization_id}/authentication_settings", a.getAuthSettings)
		r.Patch("/v1/organizations/{organization_id}/authentication_settings", a.patchAuthSettings)
		r.Get("/v1/organizations/{organization_id}/members", a.listMembers)
		r.Post("/v1/organizations/{organization_id}/members", a.addOrganizationMember)
		r.Get("/v1/organizations/{organization_id}/support-members", a.listSupportMembers)
		r.Post("/v1/organizations/{organization_id}/support-members", a.addSupportMember)
		r.Delete("/v1/organizations/{organization_id}/support-members/{member_id}", a.removeSupportMember)
		r.Patch("/v1/organizations/{organization_id}/members/{member_id}", a.updateMemberStatus)
		r.Post("/v1/organizations/{organization_id}/members/{member_id}/password", a.adminSetMemberPassword)
		r.Post("/v1/organizations/{organization_id}/members/{member_id}/resend-invite", a.resendMemberInvitation)
		r.Get("/v1/organizations/{organization_id}/members/{member_id}/security-events", a.listMemberSecurityEvents)
		r.Get("/v1/organizations/{organization_id}/members/{member_id}/audit-events", a.listMemberAuditEvents)
		r.Delete("/v1/organizations/{organization_id}/members/{member_id}", a.removeOrganizationMember)
		r.Get("/v1/organizations/{organization_id}/members/{member_id}/roles", a.listMemberRoles)
		r.Post("/v1/organizations/{organization_id}/members/{member_id}/roles", a.assignMemberRole)
		r.Delete("/v1/organizations/{organization_id}/members/{member_id}/roles/{role_id}", a.removeMemberRole)
		r.Get("/v1/organizations/{organization_id}/permissions", a.listPermissionCatalog)
		r.Get("/v1/organizations/{organization_id}/roles", a.listRoles)
		r.Post("/v1/organizations/{organization_id}/roles", a.createRole)
		r.Get("/v1/organizations/{organization_id}/roles/{role_id}", a.getRole)
		r.Patch("/v1/organizations/{organization_id}/roles/{role_id}", a.updateRole)
		r.Delete("/v1/organizations/{organization_id}/roles/{role_id}", a.deleteRole)
		r.Post("/v1/organizations/{organization_id}/companies", a.createCompany)
		r.Get("/v1/organizations/{organization_id}/companies", a.listCompanies)
		r.Patch("/v1/organizations/{organization_id}/companies/{company_id}", a.updateCompanyStatus)
		r.Patch("/v1/organizations/{organization_id}/companies/{company_id}/details", a.updateCompanyDetails)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/danfse-logo", a.uploadCompanyDanfseLogo)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/danfse-logo", a.getCompanyDanfseLogo)
		r.Delete("/v1/organizations/{organization_id}/companies/{company_id}/danfse-logo", a.deleteCompanyDanfseLogo)
		r.Get("/v1/nfse/municipal-providers", a.listNFSeMunicipalProviders)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/nfse-provider-settings", a.listCompanyNFSeProviderSettings)
		r.Put("/v1/organizations/{organization_id}/companies/{company_id}/nfse-provider-settings/{provider_code}", a.upsertCompanyNFSeProviderSettings)
		r.Delete("/v1/organizations/{organization_id}/companies/{company_id}/nfse-provider-settings/{provider_code}", a.deleteCompanyNFSeProviderSettings)
		r.Get("/v1/organizations/{organization_id}/services", a.listOrganizationServices)
		r.Patch("/v1/organizations/{organization_id}/services/{service_id}", a.updateOrganizationServiceStatus)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/nfse_services", a.listCompanyNFSeServices)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/nfse_services", a.createCompanyNFSeService)
		r.Patch("/v1/organizations/{organization_id}/companies/{company_id}/nfse_services/{nfse_service_id}", a.updateCompanyNFSeService)
		r.Delete("/v1/organizations/{organization_id}/companies/{company_id}/nfse_services/{nfse_service_id}", a.deleteCompanyNFSeService)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/nfse/next_rps", a.suggestNextRPS)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/nfse/last_classification", a.lastNFSeClassification)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/nfse/suggest_classification", a.suggestNFSeClassification)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/cnaes", a.listCompanyCNAEs)
		r.Patch("/v1/organizations/{organization_id}/companies/{company_id}/cnaes/{cnae_id}", a.updateCompanyCNAE)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/cnaes/sync", a.syncCompanyCNAEs)
		r.Get("/v1/organizations/{organization_id}/customers", a.listCustomers)
		r.Post("/v1/organizations/{organization_id}/customers", a.createCustomer)
		r.Get("/v1/organizations/{organization_id}/customers/{customer_id}", a.getCustomer)
		r.Patch("/v1/organizations/{organization_id}/customers/{customer_id}", a.updateCustomer)
		r.Get("/v1/organizations/{organization_id}/materials", a.listMaterials)
		r.Post("/v1/organizations/{organization_id}/materials", a.createMaterial)
		r.Get("/v1/organizations/{organization_id}/materials/{material_id}", a.getMaterial)
		r.Patch("/v1/organizations/{organization_id}/materials/{material_id}", a.updateMaterial)
		r.Post("/v1/organizations/{organization_id}/materials/{material_id}/uoms", a.createMaterialUOM)
		r.Patch("/v1/organizations/{organization_id}/materials/{material_id}/uoms/{uom_id}", a.updateMaterialUOM)
		r.Delete("/v1/organizations/{organization_id}/materials/{material_id}/uoms/{uom_id}", a.deleteMaterialUOM)
		r.Get("/v1/organizations/{organization_id}/lookups/cnpj/{cnpj}", a.lookupCNPJ)
		r.Get("/v1/organizations/{organization_id}/lookups/cep/{cep}", a.lookupCEP)
		r.Get("/v1/organizations/{organization_id}/catalogs/cnae", a.searchCatalogCNAE)
		r.Get("/v1/organizations/{organization_id}/catalogs/nbs", a.searchCatalogNBS)
		r.Get("/v1/organizations/{organization_id}/catalogs/lc116", a.searchCatalogLC116)
		r.Get("/v1/organizations/{organization_id}/catalogs/municipalities", a.searchCatalogMunicipalities)
		r.Get("/v1/organizations/{organization_id}/catalogs/municipalities/{code}", a.getCatalogMunicipality)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/certificates", a.uploadCertificate)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/certificates", a.listCertificates)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/certificates/active", a.getActiveCertificate)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/certificates/{certificate_id}/revoke", a.revokeCertificate)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/nfe_distribution", a.nfeDistributionStatus)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/fiscal_document_queries", a.createFiscalDocumentQuery)
		r.Get("/v1/organizations/{organization_id}/fiscal_document_queries", a.listFiscalDocumentQueries)
		r.Get("/v1/organizations/{organization_id}/fiscal_document_queries/{query_id}", a.getFiscalDocumentQuery)
		r.Get("/v1/organizations/{organization_id}/fiscal_documents/pending", a.listPendingFiscalDocuments)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/fiscal_documents/pending/{pending_document_id}/manifest", a.requestFiscalDocumentManifestation)
		r.Post("/v1/organizations/{organization_id}/companies/{company_id}/fiscal_documents/nfse", a.createOutboundNFSe)
		r.Get("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/download", a.downloadFiscalDocument)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/download_zip", a.downloadFiscalDocumentsZip)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/resubmit", a.resubmitOutboundDocument)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/abort_processing", a.abortOutboundProcessing)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/cancel", a.cancelOutboundDocument)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/cce", a.requestOutboundCCe)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/request_protocol", a.requestOutboundProtocol)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/inutilization", a.requestInutilization)
		r.Post("/v1/organizations/{organization_id}/api_clients", a.createAPIClient)
		r.Get("/v1/organizations/{organization_id}/api_clients", a.listAPIClients)
		r.Post("/v1/organizations/{organization_id}/api_clients/{api_client_id}/legacy_org_token", a.setAPIClientLegacyOrgToken)
		r.Post("/v1/organizations/{organization_id}/api_clients/{api_client_id}/inbound_token", a.rotateAPIClientInboundToken)
		r.Post("/v1/organizations/{organization_id}/api_clients/{api_client_id}/revoke", a.revokeAPIClient)
		r.Get("/v1/organizations/{organization_id}/integration_logs", a.listIntegrationLogs)
		r.Get("/v1/organizations/{organization_id}/integration_logs/{log_id}", a.getIntegrationLog)
		r.Post("/v1/organizations/{organization_id}/webhook_endpoints", a.createWebhook)
		r.Get("/v1/organizations/{organization_id}/webhook_endpoints", a.listWebhooks)
		r.Get("/v1/notifications", a.listNotifications)
		r.Get("/v1/notifications/unread_count", a.getUnreadNotificationCount)
		r.Post("/v1/notifications/read_all", a.markAllNotificationsRead)
		r.Post("/v1/notifications/{notification_id}/read", a.markNotificationRead)

		r.Post("/v1/organizations/{organization_id}/inbound-scenarios", a.createInboundScenario)
		r.Get("/v1/organizations/{organization_id}/inbound-scenarios", a.listInboundScenarios)
		r.Get("/v1/organizations/{organization_id}/inbound-scenarios/{scenario_id}", a.getInboundScenario)
		r.Patch("/v1/organizations/{organization_id}/inbound-scenarios/{scenario_id}", a.updateInboundScenario)
		r.Delete("/v1/organizations/{organization_id}/inbound-scenarios/{scenario_id}", a.deleteInboundScenario)

		r.Get("/v1/organizations/{organization_id}/vendor-material-mappings", a.listVendorMaterialMappings)
		r.Post("/v1/organizations/{organization_id}/vendor-material-mappings", a.createVendorMaterialMapping)

		r.Get("/v1/organizations/{organization_id}/fiscal_documents", a.listInboundDocuments)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/upload", a.uploadInboundDocumentXML)
		r.Get("/v1/organizations/{organization_id}/fiscal_documents/{document_id}", a.getInboundDocument)
		r.Delete("/v1/organizations/{organization_id}/fiscal_documents/{document_id}", a.deleteManualUploadDocument)
		r.Get("/v1/organizations/{organization_id}/fiscal_events", a.listFiscalEvents)
		r.Get("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/events", a.listDocumentEvents)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/manifestacao", a.registerManifestation)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/canhoto", a.registerDeliveryReceipt)
		r.Get("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/orchestration", a.getOrchestration)
		r.Patch("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/items/{item_id}", a.patchInboundItem)
		r.Patch("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/items/{item_id}/alternative_unit", a.setInboundItemAlternativeUnit)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/override", a.applyInboundOverride)
		r.Get("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/purchase-orders/search", a.searchPurchaseOrders)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/reprocess", a.reprocessInboundDocument)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/reset", a.resetInboundDocument)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/plan", a.buildExecutionPlan)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/execute", a.executeNextStep)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/steps/{step_id}/advance", a.advanceInboundStep)
		r.Post("/v1/organizations/{organization_id}/fiscal_documents/{document_id}/reject", a.rejectInboundDocument)

		r.Get("/v1/organizations/{organization_id}/integrations", a.listIntegrations)
		r.Post("/v1/organizations/{organization_id}/integrations", a.createIntegration)
		r.Patch("/v1/organizations/{organization_id}/integrations/{integration_id}", a.updateIntegration)

		r.Get("/v1/organizations/{organization_id}/support/config", a.supportConfig)
		r.Post("/v1/organizations/{organization_id}/support/tickets", a.createSupportTicket)
		r.Get("/v1/organizations/{organization_id}/support/tickets", a.listSupportTickets)
		r.Get("/v1/organizations/{organization_id}/support/tickets/{ticket_id}", a.getSupportTicket)
		r.Post("/v1/organizations/{organization_id}/support/tickets/{ticket_id}/messages", a.addSupportTicketMessage)
		r.Post("/v1/organizations/{organization_id}/support/tickets/{ticket_id}/attachments", a.uploadSupportAttachment)
		r.Get("/v1/organizations/{organization_id}/support/tickets/{ticket_id}/attachments/{attachment_id}", a.downloadSupportAttachment)

		r.Get("/v1/organizations/{organization_id}/email-credentials", a.getEmailCredentials)
		r.Put("/v1/organizations/{organization_id}/email-credentials", a.putEmailCredentials)
		r.Post("/v1/organizations/{organization_id}/email-credentials/test", a.testEmailCredentials)
		r.Get("/v1/organizations/{organization_id}/email-tokens", a.listEmailTokens)
		r.Get("/v1/organizations/{organization_id}/companies/{company_id}/email-templates", a.listCompanyEmailTemplates)
		r.Patch("/v1/organizations/{organization_id}/companies/{company_id}/email-templates/{process_code}", a.patchCompanyEmailTemplate)
		r.Get("/v1/organizations/{organization_id}/email-messages", a.listEmailMessages)
		r.Get("/v1/organizations/{organization_id}/email-messages/{message_id}", a.getEmailMessage)
		r.Get("/v1/organizations/{organization_id}/email-messages/{message_id}/attachments/{attachment_id}/download", a.downloadEmailAttachment)
	})

	return r
}

func (a *ControlPlane) inviteUser(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Email          string `json:"email"`
		PlatformRole   string `json:"platform_role"`
		OrganizationID string `json:"organization_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}

	targetRole, err := identity.ValidatePlatformRole(body.PlatformRole)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if !identity.CanCreateUser(p.PlatformRole, targetRole) {
		writeErr(w, r, domainerr.Forbidden("User role is not allowed to create this platform role"))
		return
	}

	var organizationID *uuid.UUID
	if body.OrganizationID != "" {
		id, err := uuid.Parse(body.OrganizationID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id must be a valid UUID"))
			return
		}
		organizationID = &id
		if err := a.ensureOrganizationPermission(r, id, "member:invite"); err != nil {
			writeErr(w, r, err)
			return
		}
	}
	invitation, err := a.Identity.InviteUser(r.Context(), identity.InviteUserInput{
		Email: body.Email, PlatformRole: targetRole, OrganizationID: organizationID, InvitedBy: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, invitation)
}

func (a *ControlPlane) listUsers(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	users, err := a.Identity.ListPlatformStaff(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": users})
}

func (a *ControlPlane) deleteUser(w http.ResponseWriter, r *http.Request) {
	p, err := requirePlatformStaff(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_user_id", "Invalid user_id"))
		return
	}
	target, err := a.Identity.GetByID(r.Context(), userID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if !identity.CanDeleteUser(p.PlatformRole, target.PlatformRole) {
		writeErr(w, r, domainerr.Forbidden("User role is not allowed to delete this platform role"))
		return
	}
	if err := a.Identity.SoftDelete(r.Context(), userID, p.UserID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) adminSetUserPassword(w http.ResponseWriter, r *http.Request) {
	p, err := requirePlatformStaff(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_user_id", "Invalid user_id"))
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	target, err := a.Identity.GetByID(r.Context(), userID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if !identity.CanDeleteUser(p.PlatformRole, target.PlatformRole) {
		writeErr(w, r, domainerr.Forbidden("User role is not allowed to set this user's password"))
		return
	}
	policy, err := a.Identity.PasswordPolicyForOrganization(r.Context(), nil)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Identity.AdminSetPassword(r.Context(), identity.AdminSetPasswordInput{
		ActorUserID: p.UserID, UserID: userID, Password: body.Password, Policy: policy,
		IPAddress: clientIP(r), UserAgent: r.UserAgent(),
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) adminListUserSecurityEvents(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_user_id", "Invalid user_id"))
		return
	}
	if _, err := a.Identity.GetByID(r.Context(), userID); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Identity.ListSecurityEvents(r.Context(), userID, 100)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) adminListUserAuditEvents(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_user_id", "Invalid user_id"))
		return
	}
	if _, err := a.Identity.GetByID(r.Context(), userID); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Identity.ListUserAuditEvents(r.Context(), userID, nil, 100)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) adminSetMemberPassword(w http.ResponseWriter, r *http.Request) {
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
	if err := a.ensureOrganizationPermission(r, orgID, "member:invite"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	member, err := a.Orgs.GetMember(r.Context(), orgID, memberID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if p.UserID == member.UserID {
		writeErr(w, r, domainerr.Validation("cannot_set_own_password", "Use the profile password change to update your own password"))
		return
	}
	policy, err := a.Identity.PasswordPolicyForOrganization(r.Context(), &orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Identity.AdminSetPassword(r.Context(), identity.AdminSetPasswordInput{
		ActorUserID: p.UserID, UserID: member.UserID, Password: body.Password, Policy: policy,
		OrganizationID: &orgID, IPAddress: clientIP(r), UserAgent: r.UserAgent(),
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) acceptInvitation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	user, err := a.Identity.AcceptInvitation(r.Context(), identity.AcceptInvitationInput{
		Token: body.Token, Password: body.Password,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, user)
}

func (a *ControlPlane) me(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	user, err := a.Identity.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var orgID *uuid.UUID
	if p.OrganizationID != uuid.Nil {
		orgID = &p.OrganizationID
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user":            user,
		"organization_id": orgID,
		"purpose":         p.Purpose,
	})
}

func (a *ControlPlane) clientToken(w http.ResponseWriter, r *http.Request) {
	issueClientCredentialsToken(w, r, a.Orgs, a.Tokens)
}

// issueClientCredentialsToken is the OAuth2 client-credentials grant. It is
// served by control_plane_api and inbound_api so an ERP can keep a single
// base URL for the token and the document calls.
func issueClientCredentialsToken(w http.ResponseWriter, r *http.Request, orgs *organization.Service, tokens *auth.TokenService) {
	var body struct {
		GrantType    string `json:"grant_type"`
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if body.GrantType != "client_credentials" {
		writeErr(w, r, domainerr.Validation("unsupported_grant", "grant_type must be client_credentials"))
		return
	}
	if strings.TrimSpace(body.ClientID) == "" || strings.TrimSpace(body.ClientSecret) == "" {
		writeErr(w, r, domainerr.Validation("invalid_client_credentials", "client_id and client_secret are required"))
		return
	}
	client, err := orgs.AuthenticateAPIClient(r.Context(), body.ClientID, body.ClientSecret)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	token, exp, err := tokens.IssueClientToken(client.OrganizationID, client.ClientID, client.SourceSystem, client.Scopes)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"access_token": token,
		"token_type":   "Bearer",
		"expires_at":   exp,
		"scope":        strings.Join(client.Scopes, " "),
	})
}

func (a *ControlPlane) createOrganization(w http.ResponseWriter, r *http.Request) {
	p, err := requirePlatformStaff(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		LegalName     string `json:"legal_name"`
		TradeName     string `json:"trade_name"`
		Slug          string `json:"slug"`
		TaxIdentifier string `json:"tax_identifier"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	org, err := a.Orgs.CreateOrganization(r.Context(), organization.CreateOrganizationInput{
		LegalName: body.LegalName, TradeName: body.TradeName, Slug: body.Slug,
		TaxIdentifier: body.TaxIdentifier, OwnerUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, org)
}

func (a *ControlPlane) listMyOrganizations(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		writeErr(w, r, domainerr.Forbidden("User session required"))
		return
	}
	items, err := a.Orgs.ListOrganizationsForUser(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if items == nil {
		items = []organization.Organization{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) listUserOrganizations(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_user_id", "Invalid user_id"))
		return
	}
	user, err := a.Identity.GetByID(r.Context(), userID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	switch user.PlatformRole {
	case identity.PlatformRoleAdmin, identity.PlatformRoleSystem, identity.PlatformRoleSupport:
	default:
		writeErr(w, r, domainerr.Validation("not_platform_staff", "User is not platform staff"))
		return
	}
	items, err := a.Orgs.ListOrganizationsForUser(r.Context(), userID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if items == nil {
		items = []organization.Organization{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) listSupportMembers(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Orgs.EnsureActiveOrganization(r.Context(), orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Orgs.ListSupportMembers(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if items == nil {
		items = []organization.MemberWithUser{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) addSupportMember(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	p, err := requirePlatformStaff(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Orgs.EnsureActiveOrganization(r.Context(), orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Email  string `json:"email"`
		UserID string `json:"user_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	in := organization.AddSupportMemberInput{
		OrganizationID: orgID,
		Email:          body.Email,
		ActorUserID:    p.UserID,
	}
	if strings.TrimSpace(body.UserID) != "" {
		uid, err := uuid.Parse(strings.TrimSpace(body.UserID))
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_user_id", "Invalid user_id"))
			return
		}
		in.UserID = uid
	}
	member, err := a.Orgs.AddSupportMember(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, member)
}

func (a *ControlPlane) removeSupportMember(w http.ResponseWriter, r *http.Request) {
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
	p, err := requirePlatformStaff(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	member, err := a.Orgs.GetMember(r.Context(), orgID, memberID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	switch member.PlatformRole {
	case identity.PlatformRoleAdmin, identity.PlatformRoleSystem, identity.PlatformRoleSupport:
	default:
		writeErr(w, r, domainerr.Validation("not_support_member", "Member is not platform staff"))
		return
	}
	if err := a.Orgs.UnlinkSupportMember(r.Context(), organization.RemoveMemberInput{
		OrganizationID: orgID, MemberID: memberID, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) getOrganization(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	org, err := a.Orgs.GetOrganization(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, org)
}

func (a *ControlPlane) updateOrganization(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "organization:update"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		LegalName     string `json:"legal_name"`
		TradeName     string `json:"trade_name"`
		TaxIdentifier string `json:"tax_identifier"`
		Timezone      string `json:"timezone"`
		DefaultLocale string `json:"default_locale"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	org, err := a.Orgs.UpdateOrganization(r.Context(), organization.UpdateOrganizationInput{
		OrganizationID: orgID, LegalName: body.LegalName, TradeName: body.TradeName,
		TaxIdentifier: body.TaxIdentifier, Timezone: body.Timezone,
		DefaultLocale: body.DefaultLocale, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, org)
}

func (a *ControlPlane) listOrganizations(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	orgs, err := a.Orgs.ListOrganizations(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": orgs})
}

func (a *ControlPlane) listOrganizationsUsage(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	usage, err := a.Orgs.ListOrganizationsUsage(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": usage})
}

func (a *ControlPlane) listMembers(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	members, err := a.Orgs.ListMembers(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": members})
}

func (a *ControlPlane) addOrganizationMember(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "member:invite"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Email string `json:"email"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	member, err := a.Orgs.AddExistingMember(r.Context(), organization.AddMemberInput{
		OrganizationID: orgID, Email: body.Email, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, member)
}

func (a *ControlPlane) resendMemberInvitation(w http.ResponseWriter, r *http.Request) {
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
	if err := a.ensureOrganizationPermission(r, orgID, "member:invite"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	invitation, err := a.Identity.ResendInvitation(r.Context(), identity.ResendInvitationInput{
		OrganizationID: orgID, MemberID: memberID, InvitedBy: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, invitation)
}

func (a *ControlPlane) listMemberSecurityEvents(w http.ResponseWriter, r *http.Request) {
	_, member, err := a.memberForAuditRead(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Identity.ListSecurityEvents(r.Context(), member.UserID, 100)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) listMemberAuditEvents(w http.ResponseWriter, r *http.Request) {
	orgID, member, err := a.memberForAuditRead(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Identity.ListUserAuditEvents(r.Context(), member.UserID, &orgID, 100)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) memberForAuditRead(r *http.Request) (uuid.UUID, *organization.MemberWithUser, error) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		return uuid.Nil, nil, domainerr.Validation("invalid_organization_id", "Invalid organization_id")
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "member_id"))
	if err != nil {
		return uuid.Nil, nil, domainerr.Validation("invalid_member_id", "Invalid member_id")
	}
	if err := a.ensureOrganizationPermission(r, orgID, "audit:read"); err != nil {
		return uuid.Nil, nil, err
	}
	member, err := a.Orgs.GetMember(r.Context(), orgID, memberID)
	if err != nil {
		return uuid.Nil, nil, err
	}
	return orgID, member, nil
}

func (a *ControlPlane) updateMemberStatus(w http.ResponseWriter, r *http.Request) {
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
	if err := a.ensureOrganizationPermission(r, orgID, "member:suspend"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Status string `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	member, err := a.Orgs.UpdateMemberStatus(r.Context(), organization.UpdateMemberStatusInput{
		OrganizationID: orgID, MemberID: memberID, Status: body.Status, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, member)
}

func (a *ControlPlane) removeOrganizationMember(w http.ResponseWriter, r *http.Request) {
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
	if err := a.ensureOrganizationPermission(r, orgID, "member:suspend"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	if err := a.Orgs.RemoveMember(r.Context(), organization.RemoveMemberInput{
		OrganizationID: orgID, MemberID: memberID, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) createCompany(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		LegalName   string `json:"legal_name"`
		TradeName   string `json:"trade_name"`
		CNPJ        string `json:"cnpj"`
		UF          string `json:"uf"`
		Environment string `json:"environment"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	company, err := a.Orgs.CreateCompany(r.Context(), organization.CreateCompanyInput{
		OrganizationID: orgID, LegalName: body.LegalName, TradeName: body.TradeName,
		CNPJ: body.CNPJ, UF: body.UF, Environment: body.Environment, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, company)
}

func (a *ControlPlane) listCompanies(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	companies, err := a.Orgs.ListCompanies(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": companies})
}

func (a *ControlPlane) updateCompanyStatus(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		Status string `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	company, err := a.Orgs.UpdateCompanyStatus(r.Context(), organization.UpdateCompanyStatusInput{
		OrganizationID: orgID, CompanyID: companyID, Status: body.Status, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, company)
}

// updateCompanyDetails edits cadastral fields (legal_name, trade_name, uf,
// environment) — separate from updateCompanyStatus's active/disabled
// toggle above. See organization.UpdateCompanyDetailsInput for why CNPJ
// isn't editable here.
func (a *ControlPlane) updateCompanyDetails(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		LegalName               string `json:"legal_name"`
		TradeName               string `json:"trade_name"`
		UF                      string `json:"uf"`
		Environment             string `json:"environment"`
		MunicipalRegistration   string `json:"municipal_registration"`
		IBGEMunicipalityCode    string `json:"ibge_municipality_code"`
		TaxRegime               string `json:"tax_regime"`
		SpecialTaxRegime        string `json:"special_tax_regime"`
		DanfseCustomLogoEnabled *bool  `json:"danfse_custom_logo_enabled"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	company, err := a.Orgs.UpdateCompanyDetails(r.Context(), organization.UpdateCompanyDetailsInput{
		OrganizationID:          orgID,
		CompanyID:               companyID,
		LegalName:               body.LegalName,
		TradeName:               body.TradeName,
		UF:                      body.UF,
		Environment:             body.Environment,
		MunicipalRegistration:   body.MunicipalRegistration,
		IBGEMunicipalityCode:    body.IBGEMunicipalityCode,
		TaxRegime:               body.TaxRegime,
		SpecialTaxRegime:        body.SpecialTaxRegime,
		DanfseCustomLogoEnabled: body.DanfseCustomLogoEnabled,
		ActorUserID:             p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, company)
}

func (a *ControlPlane) listOrganizationServices(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	services, err := a.Orgs.ListOrganizationServices(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": services})
}

func (a *ControlPlane) updateOrganizationServiceStatus(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	serviceID, err := uuid.Parse(chi.URLParam(r, "service_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_service_id", "Invalid service_id"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Status string `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	service, err := a.Orgs.UpdateOrganizationServiceStatus(r.Context(), organization.UpdateOrganizationServiceStatusInput{
		OrganizationID: orgID, ServiceID: serviceID, Status: body.Status, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, service)
}

// companyFromURL resolves and authorizes the {organization_id}/{company_id}
// pair shared by every certificate endpoint: session access to the
// organization plus the company actually belonging to it.
func (a *ControlPlane) companyFromURL(r *http.Request) (orgID, companyID uuid.UUID, err error) {
	orgID, err = uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_organization_id", "Invalid organization_id")
	}
	companyID, err = uuid.Parse(chi.URLParam(r, "company_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_company_id", "Invalid company_id")
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	return orgID, companyID, nil
}

func (a *ControlPlane) uploadCertificate(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		CertificateBase64 string `json:"certificate_base64"`
		Password          string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	pfx, err := base64.StdEncoding.DecodeString(body.CertificateBase64)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_certificate", "certificate_base64 must be valid base64"))
		return
	}
	cert, err := a.Certificates.UploadCertificate(r.Context(), certificate.UploadCertificateInput{
		OrganizationID: orgID, OrganizationCompanyID: companyID,
		PFX: pfx, Password: body.Password, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, cert)
}

func (a *ControlPlane) listCertificates(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	certs, err := a.Certificates.ListCertificates(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": certs})
}

func (a *ControlPlane) getActiveCertificate(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	cert, err := a.Certificates.GetActiveCertificate(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cert)
}

func (a *ControlPlane) revokeCertificate(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	certificateID, err := uuid.Parse(chi.URLParam(r, "certificate_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_certificate_id", "Invalid certificate_id"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	cert, err := a.Certificates.RevokeCertificate(r.Context(), certificate.RevokeCertificateInput{
		OrganizationID: orgID, OrganizationCompanyID: companyID,
		CertificateID: certificateID, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cert)
}

// nfeDistributionStatus is the governance surface an admin uses to see
// exactly what the nfe-gateway's distribution poller has been doing for a
// company: current NSU cursor/status plus the recent poll-by-poll log (see
// docs/architecture/22_nfe_gateway_service.md). Both pieces are owned/
// written by the Python gateway — this endpoint only reads.
func (a *ControlPlane) nfeDistributionStatus(w http.ResponseWriter, r *http.Request) {
	_, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	state, err := a.Orgs.GetNFeDistributionState(r.Context(), companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, convErr := strconv.Atoi(raw); convErr == nil {
			limit = parsed
		}
	}
	polls, err := a.Orgs.ListNFeDistributionPolls(r.Context(), companyID, limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"state": state, "polls": polls})
}

func (a *ControlPlane) listAPIClients(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	clients, err := a.Orgs.ListAPIClients(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": clients})
}

func (a *ControlPlane) createAPIClient(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Name             string   `json:"name"`
		SourceSystem     string   `json:"source_system"`
		Scopes           []string `json:"scopes"`
		OrgToken         string   `json:"org_token"`
		GenerateOrgToken bool     `json:"generate_org_token"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	created, err := a.Orgs.CreateAPIClient(r.Context(), organization.CreateAPIClientInput{
		OrganizationID: orgID, Name: body.Name, SourceSystem: body.SourceSystem, Scopes: body.Scopes,
		LegacyOrgToken: body.OrgToken, GenerateOrgToken: body.GenerateOrgToken, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (a *ControlPlane) setAPIClientLegacyOrgToken(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	clientID, err := uuid.Parse(chi.URLParam(r, "api_client_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_api_client_id", "Invalid api_client_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		OrgToken string `json:"org_token"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if err := a.Orgs.SetLegacyOrgToken(r.Context(), organization.SetLegacyOrgTokenInput{
		OrganizationID: orgID, APIClientID: clientID, OrgToken: body.OrgToken, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"has_legacy_org_token": true})
}

func (a *ControlPlane) rotateAPIClientInboundToken(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	clientID, err := uuid.Parse(chi.URLParam(r, "api_client_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_api_client_id", "Invalid api_client_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	rotated, err := a.Orgs.RotateInboundToken(r.Context(), organization.RotateInboundTokenInput{
		OrganizationID: orgID, APIClientID: clientID, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rotated)
}

func (a *ControlPlane) revokeAPIClient(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	clientID, err := uuid.Parse(chi.URLParam(r, "api_client_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_api_client_id", "Invalid api_client_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Orgs.RevokeAPIClient(r.Context(), organization.RevokeAPIClientInput{
		OrganizationID: orgID, APIClientID: clientID, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "revoked"})
}

func (a *ControlPlane) createWebhook(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "webhook:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Name                  string   `json:"name"`
		URL                   string   `json:"url"`
		OrganizationCompanyID string   `json:"organization_company_id"`
		EventTypes            []string `json:"event_types"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
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
	created, err := a.Webhooks.CreateEndpoint(r.Context(), webhook.CreateEndpointInput{
		OrganizationID: orgID, OrganizationCompanyID: companyID,
		Name: body.Name, URL: body.URL, EventTypes: body.EventTypes,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (a *ControlPlane) listWebhooks(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	endpoints, err := a.Webhooks.ListEndpoints(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": endpoints})
}

func (a *ControlPlane) listNotifications(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	limit, err := parseLimitParam(r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Notifications.List(r.Context(), notification.ListInput{
		UserID:     p.UserID,
		UnreadOnly: r.URL.Query().Get("unread") == "true",
		Limit:      limit,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getUnreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	count, err := a.Notifications.CountUnread(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"unread_count": count})
}

func (a *ControlPlane) markNotificationRead(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	notificationID, err := uuid.Parse(chi.URLParam(r, "notification_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_notification_id", "Invalid notification_id"))
		return
	}
	n, err := a.Notifications.MarkRead(r.Context(), p.UserID, notificationID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, n)
}

func (a *ControlPlane) markAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	count, err := a.Notifications.MarkAllRead(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"marked_read": count})
}

func parseLimitParam(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 0 {
		return 0, domainerr.Validation("invalid_limit", "limit must be a non-negative integer")
	}
	return limit, nil
}

// requirePlatformStaff authorizes platform-wide endpoints (list all
// organizations, cross-tenant usage stats, list platform staff) that are not
// scoped to the caller's active session organization — unlike
// ensureOrganizationAccess, it does not require p.OrganizationID to match
// anything, since admin/system/support accounts may log in without
// selecting an organization at all.
func requirePlatformStaff(r *http.Request) (*auth.Principal, error) {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		return nil, domainerr.Forbidden("User session required")
	}
	switch p.PlatformRole {
	case identity.PlatformRoleAdmin, identity.PlatformRoleSystem, identity.PlatformRoleSupport:
		return p, nil
	default:
		return nil, domainerr.Forbidden("Platform admin role required")
	}
}

func (a *ControlPlane) ensureOrganizationAccess(r *http.Request, organizationID uuid.UUID) error {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		return domainerr.Forbidden("User session required")
	}
	// Platform staff act across every tenant from the /admin panel, whose
	// session is not scoped to any single organization (organization_id is
	// nil unless they explicitly picked one at login) — so they are
	// authorized by role alone, not by a matching session organization_id.
	if p.PlatformRole == identity.PlatformRoleAdmin ||
		p.PlatformRole == identity.PlatformRoleSystem ||
		p.PlatformRole == identity.PlatformRoleSupport {
		return a.Orgs.EnsureActiveOrganization(r.Context(), organizationID)
	}
	if p.OrganizationID != organizationID {
		return domainerr.Forbidden("organization_id does not match the active session organization")
	}
	return a.Orgs.EnsureMember(r.Context(), organizationID, p.UserID)
}

// ensureOrganizationPermission is like ensureOrganizationAccess but also
// requires the caller to hold a tenant role granting the given
// resource:action permission — used to gate role/permission management
// itself so only members holding "role:manage" (e.g. the seeded
// Administrador role) can create roles or change who has them.
func (a *ControlPlane) ensureOrganizationPermission(r *http.Request, organizationID uuid.UUID, permission string) error {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		return domainerr.Forbidden("User session required")
	}
	if p.PlatformRole == identity.PlatformRoleAdmin ||
		p.PlatformRole == identity.PlatformRoleSystem ||
		p.PlatformRole == identity.PlatformRoleSupport {
		return a.Orgs.EnsureActiveOrganization(r.Context(), organizationID)
	}
	if p.OrganizationID != organizationID {
		return domainerr.Forbidden("organization_id does not match the active session organization")
	}
	if err := a.Orgs.EnsureMember(r.Context(), organizationID, p.UserID); err != nil {
		return err
	}
	allowed, err := a.Orgs.MemberHasPermission(r.Context(), organizationID, p.UserID, permission)
	if err != nil {
		return err
	}
	if !allowed {
		return domainerr.Forbidden("Missing permission: " + permission)
	}
	return nil
}

// ensureProcessingAdmin allows the platform admin and the tenant
// Administrador role to stop an outbound note that has not been sent.
func (a *ControlPlane) ensureProcessingAdmin(r *http.Request, organizationID uuid.UUID) error {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		return domainerr.Forbidden("User session required")
	}
	if p.PlatformRole == identity.PlatformRoleAdmin {
		return a.Orgs.EnsureActiveOrganization(r.Context(), organizationID)
	}
	if p.OrganizationID != organizationID {
		return domainerr.Forbidden("organization_id does not match the active session organization")
	}
	if err := a.Orgs.EnsureMember(r.Context(), organizationID, p.UserID); err != nil {
		return err
	}
	allowed, err := a.Orgs.MemberHasRoleSlug(r.Context(), organizationID, p.UserID, "administrador")
	if err != nil {
		return err
	}
	if !allowed {
		return domainerr.Forbidden("Apenas um administrador pode cancelar o processamento")
	}
	return nil
}

func (a *ControlPlane) ensureAnyOrganizationPermission(r *http.Request, organizationID uuid.UUID, permissions ...string) error {
	if len(permissions) == 0 {
		return domainerr.Forbidden("Missing permission")
	}
	var last error
	for _, permission := range permissions {
		err := a.ensureOrganizationPermission(r, organizationID, permission)
		if err == nil {
			return nil
		}
		last = err
	}
	return last
}

type InboundAPI struct {
	Fiscal  *fiscal.Service
	Inbound *inbound.Service
	Orgs    *organization.Service
	Tokens  *auth.TokenService
}

func (a *InboundAPI) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Post("/v1/oauth/token", a.clientToken)

	// SAP programs (e.g. NFS-e) still call the canonical outbound route with
	// X-Org-Token; Bearer wins when both are sent.
	r.Group(func(r chi.Router) {
		r.Use(a.bearerOrLegacyOrgTokenAuth)
		r.Use(auth.RequireClient)
		r.Post("/v1/fiscal_documents/{document_type}", a.receiveDocument)
	})

	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(a.Tokens))
		r.Use(auth.RequireClient)
		r.Get("/v1/fiscal_documents/{document_id}", a.getDocument)
		r.Get("/v1/fiscal_documents/{document_id}/timeline", a.getTimeline)
		r.Post("/v1/inbound/fiscal_documents/{document_type}", a.receiveInboundDocument)
	})

	// Frozen v1 SAP contract used by existing CPI iflows. Canonical clients
	// should keep using /v1/fiscal_documents/{document_type} with OAuth.
	r.Group(func(r chi.Router) {
		r.Use(a.legacyOrgTokenAuth)
		r.Post("/api/v1/nfe/documents/sap", a.receiveLegacySAPDocument)
		r.Post("/v1/nfe/documents/sap", a.receiveLegacySAPDocument)
		a.sapEventRoutes(r, "/api/v1/nfe/documents/sap")
		a.sapEventRoutes(r, "/v1/nfe/documents/sap")
		r.Get("/api/v1/nfse/documents/sap/{chave_acesso}/danfe", a.sapDownloadDanfse)
		r.Get("/v1/nfse/documents/sap/{chave_acesso}/danfe", a.sapDownloadDanfse)
		r.Get("/api/v1/nfse/documents/sap/{chave_acesso}/xml", a.sapDownloadNFSeXML)
		r.Get("/v1/nfse/documents/sap/{chave_acesso}/xml", a.sapDownloadNFSeXML)
	})
	return r
}

func (a *InboundAPI) clientToken(w http.ResponseWriter, r *http.Request) {
	issueClientCredentialsToken(w, r, a.Orgs, a.Tokens)
}

func (a *InboundAPI) bearerOrLegacyOrgTokenAuth(next http.Handler) http.Handler {
	bearer := auth.Middleware(a.Tokens)(next)
	legacy := a.legacyOrgTokenAuth(next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") &&
			strings.TrimSpace(r.Header.Get("X-Org-Token")) != "" {
			legacy.ServeHTTP(w, r)
			return
		}
		bearer.ServeHTTP(w, r)
	})
}

func (a *InboundAPI) legacyOrgTokenAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(r.Header.Get("X-Org-Token"))
		if token == "" {
			httpx.WriteProblem(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", "Missing x-Org-Token", httpx.TraceIDFrom(r.Context()))
			return
		}
		if a.Orgs == nil {
			httpx.WriteProblem(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", "Invalid organization token", httpx.TraceIDFrom(r.Context()))
			return
		}
		client, err := a.Orgs.AuthenticateByLegacyOrgToken(r.Context(), token)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		principal := &auth.Principal{
			Kind:           auth.TokenKindClient,
			OrganizationID: client.OrganizationID,
			ClientID:       client.ClientID,
			SourceSystem:   client.SourceSystem,
			Scopes:         client.Scopes,
		}
		next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), principal)))
	})
}

// receiveInboundDocument is the entry point for NF-e/NFS-e issued by a
// third party and received by this organization (direction=inbound) —
// unlike receiveDocument (always outbound), it persists the envelope via
// fiscal.Service.Receive and then schedules the orchestrator pipeline
// (XML enrichment + matching) in the background so the HTTP request is
// not held open while SAP matching runs.
func (a *InboundAPI) receiveInboundDocument(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	// fiscal_documents:create (legacy, both directions) still works for
	// clients provisioned before the narrower scope existed — see
	// allowedAPIClientScopes in internal/organization/cnpj.go.
	if !auth.HasAnyScope(p, "fiscal_documents:inbound:create", "fiscal_documents:create") {
		writeErr(w, r, domainerr.Forbidden("Missing scope fiscal_documents:inbound:create"))
		return
	}

	documentType := chi.URLParam(r, "document_type")
	idempotencyKey := r.Header.Get("Idempotency-Key")
	contentType := r.Header.Get("Content-Type")

	defer r.Body.Close()
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_body", "Failed to read request body"))
		return
	}

	var nfe *fiscal.NFeExtension
	if documentType == "nfe" {
		header, err := inbound.ExtractNFeHeader(payload, contentType)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_xml", "Failed to parse NF-e XML: "+err.Error()))
			return
		}
		nfe = inbound.NFeExtensionFromHeader(header)
	}

	result, err := a.Fiscal.Receive(r.Context(), fiscal.ReceiveInput{
		OrganizationID: p.OrganizationID,
		DocumentType:   documentType,
		Direction:      "inbound",
		SourceSystem:   p.SourceSystem,
		IdempotencyKey: idempotencyKey,
		Payload:        payload,
		ContentType:    contentType,
		ActorType:      "api_client",
		ActorID:        p.ClientID,
		CorrelationID:  httpx.CorrelationIDFrom(r.Context()),
		TraceID:        httpx.TraceIDFrom(r.Context()),
		NFe:            nfe,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}

	status := http.StatusAccepted
	if result.Replayed {
		status = http.StatusOK
	} else {
		a.Inbound.ScheduleInboundPipeline(p.OrganizationID, result.Document.OrganizationCompanyID, result.Document.ID, payload, contentType)
	}
	httpx.WriteJSON(w, status, map[string]any{
		"document_id":       result.Document.ID,
		"trace_id":          result.Document.TraceID,
		"status":            result.Document.Status,
		"processing_status": result.Document.ProcessingStatus,
		"replayed":          result.Replayed,
	})
}

func (a *InboundAPI) receiveDocument(w http.ResponseWriter, r *http.Request) {
	a.receiveOutboundDocument(w, r, chi.URLParam(r, "document_type"), false)
}

func (a *InboundAPI) receiveLegacySAPDocument(w http.ResponseWriter, r *http.Request) {
	a.receiveOutboundDocument(w, r, "nfe", true)
}

func (a *InboundAPI) receiveOutboundDocument(w http.ResponseWriter, r *http.Request, documentType string, deriveIdempotency bool) {
	p, _ := auth.PrincipalFrom(r.Context())
	if !auth.HasAnyScope(p, "fiscal_documents:outbound:create", "fiscal_documents:create") {
		writeErr(w, r, domainerr.Forbidden("Missing scope fiscal_documents:outbound:create"))
		return
	}

	defer r.Body.Close()
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_body", "Failed to read request body"))
		return
	}

	if deriveIdempotency {
		if err := rejectSAPEventOnEmissionRoute(payload); err != nil {
			writeErr(w, r, err)
			return
		}
	}

	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" && deriveIdempotency {
		// Existing SAP iflows do not send Idempotency-Key; derive a stable
		// key from the payload so retries of the same document replay.
		idempotencyKey = crypto.SHA256Hex(payload)
	}

	result, err := a.Fiscal.Receive(r.Context(), fiscal.ReceiveInput{
		OrganizationID: p.OrganizationID,
		DocumentType:   documentType,
		Direction:      "outbound",
		SourceSystem:   p.SourceSystem,
		IdempotencyKey: idempotencyKey,
		Payload:        payload,
		ContentType:    r.Header.Get("Content-Type"),
		ActorType:      "api_client",
		ActorID:        p.ClientID,
		CorrelationID:  httpx.CorrelationIDFrom(r.Context()),
		TraceID:        httpx.TraceIDFrom(r.Context()),
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}

	label := "NF-e"
	if strings.EqualFold(documentType, "nfse") {
		label = "NFS-e"
	}
	if result.AlreadyAuthorized {
		body := map[string]any{
			"document_id":        result.Document.ID,
			"trace_id":           result.Document.TraceID,
			"status":             result.Document.Status,
			"already_authorized": true,
			"message":            label + " já autorizada",
		}
		if result.AccessKey != "" {
			body["access_key"] = result.AccessKey
		}
		if result.Protocol != "" {
			body["protocol"] = result.Protocol
		}
		if result.Number != "" {
			body["numero"] = result.Number
		}
		if result.RPSNumber != "" {
			body["numero_rps"] = result.RPSNumber
		}
		if result.Series != "" {
			body["serie"] = result.Series
		}
		httpx.WriteJSON(w, http.StatusOK, body)
		return
	}

	status := http.StatusAccepted
	if result.Replayed {
		status = http.StatusOK
	}
	body := map[string]any{
		"document_id": result.Document.ID,
		"trace_id":    result.Document.TraceID,
		"status":      result.Document.Status,
	}
	if result.Resubmitted {
		body["resubmitted"] = true
		body["message"] = label + " atualizada e reenviada para autorização"
	}
	httpx.WriteJSON(w, status, body)
}

func (a *InboundAPI) getDocument(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	if !auth.HasScope(p, "fiscal_documents:read") {
		writeErr(w, r, domainerr.Forbidden("Missing scope fiscal_documents:read"))
		return
	}
	doc, err := a.Fiscal.GetDocumentByRef(r.Context(), fiscal.GetDocumentByRefInput{
		OrganizationID: p.OrganizationID,
		Ref:            chi.URLParam(r, "document_id"),
		SourceSystem:   p.SourceSystem,
		ActorType:      "api_client",
		ActorID:        p.ClientID,
		CorrelationID:  httpx.CorrelationIDFrom(r.Context()),
		TraceID:        httpx.TraceIDFrom(r.Context()),
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if strings.EqualFold(doc.DocumentType, "nfse") {
		consult, err := a.Fiscal.NFSeConsult(r.Context(), doc)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, nfseConsultResponse{Document: *doc, consult: consult})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, doc)
}

type nfseConsultResponse struct {
	fiscal.Document
	consult fiscal.NFSeConsult
}

func (r nfseConsultResponse) MarshalJSON() ([]byte, error) {
	body, err := json.Marshal(r.Document)
	if err != nil {
		return nil, err
	}
	var fields map[string]any
	if err := json.Unmarshal(body, &fields); err != nil {
		return nil, err
	}
	if r.consult.AccessKey != "" {
		fields["access_key"] = r.consult.AccessKey
	}
	if r.consult.Numero != "" {
		fields["numero"] = r.consult.Numero
	}
	if r.consult.NumeroRPS != "" {
		fields["numero_rps"] = r.consult.NumeroRPS
	}
	if r.consult.Serie != "" {
		fields["serie"] = r.consult.Serie
	}
	if r.consult.CodigoVerificacao != "" {
		fields["codigo_verificacao"] = r.consult.CodigoVerificacao
	}
	if r.consult.Protocol != "" {
		fields["protocol"] = r.consult.Protocol
	}
	if r.consult.URL != "" {
		fields["url"] = r.consult.URL
	}
	if r.consult.Provider != "" {
		fields["nfse_provider"] = r.consult.Provider
	}
	return json.Marshal(fields)
}

func (a *InboundAPI) getTimeline(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	if !auth.HasScope(p, "fiscal_documents:read") {
		writeErr(w, r, domainerr.Forbidden("Missing scope fiscal_documents:read"))
		return
	}
	docID, err := uuid.Parse(chi.URLParam(r, "document_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_document_id", "Invalid document_id"))
		return
	}
	events, err := a.Fiscal.ListTimeline(r.Context(), p.OrganizationID, docID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": events})
}
