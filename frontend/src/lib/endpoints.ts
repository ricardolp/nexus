import { apiFetch, apiFetchBlob, triggerBlobDownload } from './api';
import type {
  ApiAuthSettings,
  ApiCertificate,
  ApiCompany,
  ApiCompanyService,
  ApiDocumentEvent,
  ApiExecutionPlan,
  ApiFiscalDocument,
  ApiFiscalDocumentQuery,
  ApiFiscalDocumentQueryDetail,
  ApiInboundOverride,
  ApiInboundScenarioWithRule,
  ApiAPIClient,
  ApiIntegration,
  ApiIntegrationConfiguration,
  CreatedApiClient,
  RotatedInboundToken,
  ApiInvitation,
  ApiMember,
  ApiMemberRole,
  ApiNfeDistributionStatus,
  ApiNotification,
  ApiOrchestrationView,
  ApiOrganization,
  ApiOrganizationUsage,
  ApiCompanyUsage,
  ApiBillingStatement,
  ApiPasswordPolicy,
  ApiPendingFiscalDocument,
  ApiPlanStep,
  ApiPlatformError,
  ApiPlatformStatus,
  ApiPurchaseOrder,
  ApiRequestTrace,
  ApiRole,
  ApiAuditEvent,
  ApiSecurityEvent,
  ApiSession,
  ApiUser,
  ApiVendorMaterialMapping,
  FiscalQueryType,
  LoginResponse,
  PlatformErrorSource,
  PlatformRole
} from './api-types';

export function getControlPlaneHealth() {
  return apiFetch<{ status: string }>('/health');
}

export function login(email: string, password: string, rememberBrowser = true) {
  return apiFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: { email, password, remember_browser: rememberBrowser }
  });
}

export function verifyMfaLogin(challengeToken: string, code: string, rememberBrowser = true) {
  return apiFetch<LoginResponse>('/v1/auth/mfa/verify', {
    method: 'POST',
    body: { challenge_token: challengeToken || undefined, code, remember_browser: rememberBrowser }
  });
}

export function refreshAuthToken(refreshToken?: string) {
  return apiFetch<LoginResponse>('/v1/auth/refresh', {
    method: 'POST',
    body: refreshToken ? { refresh_token: refreshToken } : {}
  });
}

export function logout(token?: string) {
  return apiFetch<void>('/v1/auth/logout', { method: 'POST', token: token || undefined });
}

export function forgotPassword(email: string) {
  return apiFetch<{ message: string }>('/v1/auth/password/forgot', {
    method: 'POST',
    body: { email }
  });
}

export function resetPassword(token: string, newPassword: string) {
  return apiFetch<void>('/v1/auth/password/reset', {
    method: 'POST',
    body: { token, new_password: newPassword }
  });
}

export function getInvitationPasswordPolicy(token: string) {
  return apiFetch<ApiPasswordPolicy>(
    `/v1/auth/invitations/password-policy?token=${encodeURIComponent(token)}`
  );
}

export function getMe(token?: string) {
  return apiFetch<{ user: ApiUser; organization_id?: string | null; purpose?: string }>(
    '/v1/users/me',
    { token }
  );
}

export function updateMe(
  token: string,
  body: {
    display_name?: string;
    phone?: string;
    bio?: string;
    timezone?: string;
    locale?: string;
    appearance_json?: Record<string, unknown>;
    notification_preferences_json?: Record<string, unknown>;
  }
) {
  return apiFetch<ApiUser>('/v1/users/me', { method: 'PATCH', token, body });
}

export function changePassword(
  token: string,
  body: { current_password: string; new_password: string; revoke_other_sessions?: boolean }
) {
  return apiFetch<void>('/v1/users/me/password', { method: 'POST', token, body });
}

export function getMyPasswordPolicy(token: string) {
  return apiFetch<ApiPasswordPolicy>('/v1/users/me/password-policy', { token });
}

export function uploadAvatar(token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<ApiUser>('/v1/users/me/avatar', { method: 'POST', token, formData });
}

export function deleteAvatar(token: string) {
  return apiFetch<void>('/v1/users/me/avatar', { method: 'DELETE', token });
}

export function getAvatarBlob(token: string) {
  return apiFetchBlob('/v1/users/me/avatar', { token });
}

export function getMfaStatus(token: string) {
  return apiFetch<{ enabled: boolean }>('/v1/users/me/mfa', { token });
}

export function enrollMfa(token: string) {
  return apiFetch<{ secret: string; otpauth_url: string }>('/v1/users/me/mfa/enroll', {
    method: 'POST',
    token
  });
}

export function confirmMfa(token: string, code: string) {
  return apiFetch<{
    recovery_codes: string[];
    user?: ApiUser;
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    organization_id?: string | null;
    mfa_setup_required?: boolean;
  }>('/v1/users/me/mfa/confirm', {
    method: 'POST',
    token,
    body: { code }
  });
}

export function disableMfa(token: string, password: string, code: string) {
  return apiFetch<void>('/v1/users/me/mfa/disable', {
    method: 'POST',
    token,
    body: { password, code }
  });
}

export function regenerateRecoveryCodes(token: string, password: string) {
  return apiFetch<{ recovery_codes: string[] }>('/v1/users/me/mfa/recovery-codes/regenerate', {
    method: 'POST',
    token,
    body: { password }
  });
}

export function listSessions(token: string) {
  return apiFetch<{ items: ApiSession[] }>('/v1/users/me/sessions', { token });
}

export function revokeSession(token: string, sessionId: string) {
  return apiFetch<void>(`/v1/users/me/sessions/${sessionId}`, { method: 'DELETE', token });
}

export function revokeOtherSessions(token: string) {
  return apiFetch<{ revoked: number }>('/v1/users/me/sessions/revoke-others', {
    method: 'POST',
    token
  });
}

export function listSecurityEvents(token: string) {
  return apiFetch<{ items: ApiSecurityEvent[] }>('/v1/users/me/security-events', { token });
}

export function listUserSecurityEvents(token: string, userId: string) {
  return apiFetch<{ items: ApiSecurityEvent[] }>(`/v1/users/${userId}/security-events`, { token });
}

export function listUserAuditEvents(token: string, userId: string) {
  return apiFetch<{ items: ApiAuditEvent[] }>(`/v1/users/${userId}/audit-events`, { token });
}

export function listMemberSecurityEvents(token: string, organizationId: string, memberId: string) {
  return apiFetch<{ items: ApiSecurityEvent[] }>(
    `/v1/organizations/${organizationId}/members/${memberId}/security-events`,
    { token }
  );
}

export function listMemberAuditEvents(token: string, organizationId: string, memberId: string) {
  return apiFetch<{ items: ApiAuditEvent[] }>(
    `/v1/organizations/${organizationId}/members/${memberId}/audit-events`,
    { token }
  );
}

export function getAuthSettings(token: string, organizationId: string) {
  return apiFetch<ApiAuthSettings>(
    `/v1/organizations/${organizationId}/authentication_settings`,
    { token }
  );
}

export function updateAuthSettings(
  token: string,
  organizationId: string,
  body: Partial<{
    min_password_length: number;
    max_password_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_number: boolean;
    require_special: boolean;
    mfa_required: boolean;
    access_locked: boolean;
    access_lock_message: string;
    session_idle_timeout_minutes: number;
    session_absolute_timeout_minutes: number;
  }>
) {
  return apiFetch<ApiAuthSettings>(
    `/v1/organizations/${organizationId}/authentication_settings`,
    { method: 'PATCH', token, body }
  );
}

export function getOrganization(token: string, organizationId: string) {
  return apiFetch<ApiOrganization>(`/v1/organizations/${organizationId}`, { token });
}

export function updateOrganization(
  token: string,
  organizationId: string,
  body: {
    legal_name: string;
    trade_name?: string;
    tax_identifier?: string;
    timezone?: string;
    default_locale?: string;
  }
) {
  return apiFetch<ApiOrganization>(`/v1/organizations/${organizationId}`, {
    method: 'PATCH',
    token,
    body
  });
}

export function listOrganizations(token: string) {
  return apiFetch<{ items: ApiOrganization[] }>('/v1/organizations', { token });
}

export function listPlatformUsers(token: string) {
  return apiFetch<{ items: ApiUser[] }>('/v1/users', { token });
}

export function deletePlatformUser(token: string, userId: string) {
  return apiFetch<void>(`/v1/users/${userId}`, { method: 'DELETE', token });
}

export function setPlatformUserPassword(token: string, userId: string, password: string) {
  return apiFetch<void>(`/v1/users/${userId}/password`, {
    method: 'POST',
    token,
    body: { password }
  });
}

export function setMemberPassword(
  token: string,
  organizationId: string,
  memberId: string,
  password: string
) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/members/${memberId}/password`, {
    method: 'POST',
    token,
    body: { password }
  });
}

export function acceptInvitation(token: string, password: string) {
  return apiFetch<ApiUser>('/v1/auth/invitations/accept', {
    method: 'POST',
    body: { token, password }
  });
}

export function inviteUser(
  token: string,
  email: string,
  platformRole: PlatformRole,
  organizationId?: string
) {
  return apiFetch<ApiInvitation>('/v1/users', {
    method: 'POST',
    token,
    body: {
      email,
      platform_role: platformRole,
      ...(organizationId ? { organization_id: organizationId } : {})
    }
  });
}

export function listMembers(token: string, organizationId: string) {
  return apiFetch<{ items: ApiMember[] }>(`/v1/organizations/${organizationId}/members`, { token });
}

export function addOrganizationMember(token: string, organizationId: string, email: string) {
  return apiFetch<ApiMember>(`/v1/organizations/${organizationId}/members`, {
    method: 'POST',
    token,
    body: { email }
  });
}

export function updateMemberStatus(
  token: string,
  organizationId: string,
  memberId: string,
  status: 'active' | 'suspended'
) {
  return apiFetch<ApiMember>(`/v1/organizations/${organizationId}/members/${memberId}`, {
    method: 'PATCH',
    token,
    body: { status }
  });
}

export function removeOrganizationMember(token: string, organizationId: string, memberId: string) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/members/${memberId}`, {
    method: 'DELETE',
    token
  });
}

export function resendMemberInvitation(token: string, organizationId: string, memberId: string) {
  return apiFetch<ApiInvitation>(
    `/v1/organizations/${organizationId}/members/${memberId}/resend-invite`,
    { method: 'POST', token }
  );
}

export function listOrganizationsUsage(token: string) {
  return apiFetch<{ items: ApiOrganizationUsage[] } | ApiOrganizationUsage[]>(
    '/v1/organizations/usage-stats',
    { token }
  );
}

export function listCompaniesUsage(token: string, organizationId: string) {
  return apiFetch<{ items: ApiCompanyUsage[] }>(
    `/v1/organizations/${organizationId}/companies/usage`,
    { token }
  );
}

export function getBillingStatement(
  token: string,
  organizationId: string,
  params: { from: string; to: string }
) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return apiFetch<ApiBillingStatement>(
    `/v1/organizations/${organizationId}/billing/statement?${qs}`,
    { token }
  );
}

export async function downloadBillingStatementPDF(
  token: string,
  organizationId: string,
  params: { from: string; to: string }
) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  const { blob, filename } = await apiFetchBlob(
    `/v1/organizations/${organizationId}/billing/statement.pdf?${qs}`,
    { token }
  );
  triggerBlobDownload(blob, filename);
}

export function listRequestTraces(
  token: string,
  params?: {
    organization_id?: string;
    http_status?: number;
    span_name?: string;
    since?: string;
    until?: string;
    before?: string;
    limit?: number;
  }
) {
  const qs = new URLSearchParams();
  if (params?.organization_id) qs.set('organization_id', params.organization_id);
  if (params?.http_status != null) qs.set('http_status', String(params.http_status));
  if (params?.span_name) qs.set('span_name', params.span_name);
  if (params?.since) qs.set('since', params.since);
  if (params?.until) qs.set('until', params.until);
  if (params?.before) qs.set('before', params.before);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<{ items: ApiRequestTrace[]; next_before?: string | null }>(
    `/v1/request_traces${query ? `?${query}` : ''}`,
    { token }
  );
}

export function getRequestTrace(token: string, traceId: string) {
  return apiFetch<ApiRequestTrace>(`/v1/request_traces/${traceId}`, { token });
}

export function listPlatformErrors(
  token: string,
  params?: {
    organization_id?: string;
    source?: PlatformErrorSource | string;
    before?: string;
    limit?: number;
  }
) {
  const qs = new URLSearchParams();
  if (params?.organization_id) qs.set('organization_id', params.organization_id);
  if (params?.source) qs.set('source', params.source);
  if (params?.before) qs.set('before', params.before);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<{ items: ApiPlatformError[]; next_before?: string | null }>(
    `/v1/platform/errors${query ? `?${query}` : ''}`,
    { token }
  );
}

export function getPlatformStatus(token: string) {
  return apiFetch<ApiPlatformStatus>('/v1/platform/status', { token });
}

export function listPermissionCatalog(token: string, organizationId: string) {
  return apiFetch<{ items: string[] }>(`/v1/organizations/${organizationId}/permissions`, { token });
}

export function listRoles(token: string, organizationId: string) {
  return apiFetch<{ items: ApiRole[] }>(`/v1/organizations/${organizationId}/roles`, { token });
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export function createRole(token: string, organizationId: string, input: RoleInput) {
  return apiFetch<ApiRole>(`/v1/organizations/${organizationId}/roles`, {
    method: 'POST',
    token,
    body: input
  });
}

export function updateRole(token: string, organizationId: string, roleId: string, input: RoleInput) {
  return apiFetch<ApiRole>(`/v1/organizations/${organizationId}/roles/${roleId}`, {
    method: 'PATCH',
    token,
    body: input
  });
}

export function deleteRole(token: string, organizationId: string, roleId: string) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/roles/${roleId}`, {
    method: 'DELETE',
    token
  });
}

export function listMemberRoles(token: string, organizationId: string, memberId: string) {
  return apiFetch<{ items: ApiMemberRole[] }>(
    `/v1/organizations/${organizationId}/members/${memberId}/roles`,
    { token }
  );
}

export function assignMemberRole(
  token: string,
  organizationId: string,
  memberId: string,
  roleId: string
) {
  return apiFetch<ApiMemberRole>(`/v1/organizations/${organizationId}/members/${memberId}/roles`, {
    method: 'POST',
    token,
    body: { role_id: roleId }
  });
}

export function removeMemberRole(
  token: string,
  organizationId: string,
  memberId: string,
  roleId: string
) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/members/${memberId}/roles/${roleId}`, {
    method: 'DELETE',
    token
  });
}

export function listAPIClients(token: string, organizationId: string) {
  return apiFetch<{ items: ApiAPIClient[] }>(`/v1/organizations/${organizationId}/api_clients`, {
    token
  });
}

export interface CreateAPIClientInput {
  name: string;
  source_system: string;
  scopes: string[];
  generate_org_token?: boolean;
}

export function createAPIClient(token: string, organizationId: string, input: CreateAPIClientInput) {
  return apiFetch<CreatedApiClient>(`/v1/organizations/${organizationId}/api_clients`, {
    method: 'POST',
    token,
    body: input
  });
}

export function rotateAPIClientInboundToken(token: string, organizationId: string, apiClientId: string) {
  return apiFetch<RotatedInboundToken>(
    `/v1/organizations/${organizationId}/api_clients/${apiClientId}/inbound_token`,
    { method: 'POST', token }
  );
}

export function revokeAPIClient(token: string, organizationId: string, apiClientId: string) {
  return apiFetch<{ status: string }>(
    `/v1/organizations/${organizationId}/api_clients/${apiClientId}/revoke`,
    { method: 'POST', token }
  );
}

export function listIntegrations(token: string, organizationId: string) {
  return apiFetch<{ items: ApiIntegration[] }>(`/v1/organizations/${organizationId}/integrations`, {
    token
  });
}

export interface CreateIntegrationInput {
  name: string;
  integration_type: string;
  environment: string;
  base_url: string;
  client_secret?: string;
  configuration: ApiIntegrationConfiguration;
}

export function createIntegration(token: string, organizationId: string, input: CreateIntegrationInput) {
  return apiFetch<ApiIntegration>(`/v1/organizations/${organizationId}/integrations`, {
    method: 'POST',
    token,
    body: input
  });
}

export interface UpdateIntegrationInput {
  name: string;
  base_url: string;
  status: string;
  client_secret?: string | null;
  configuration: ApiIntegrationConfiguration;
}

export function updateIntegration(
  token: string,
  organizationId: string,
  integrationId: string,
  input: UpdateIntegrationInput
) {
  return apiFetch<ApiIntegration>(`/v1/organizations/${organizationId}/integrations/${integrationId}`, {
    method: 'PATCH',
    token,
    body: input
  });
}

export interface ListFiscalDocumentsParams {
  documentType: 'nfe' | 'nfse';
  status?: string;
  limit?: number;
}

export function listFiscalDocuments(
  token: string,
  organizationId: string,
  params: ListFiscalDocumentsParams
) {
  const query = new URLSearchParams({ document_type: params.documentType });
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  return apiFetch<{ items: ApiFiscalDocument[] }>(
    `/v1/organizations/${organizationId}/fiscal_documents?${query.toString()}`,
    { token }
  );
}

export interface UploadFiscalDocumentXMLResult {
  document_id: string;
  trace_id: string;
  status: string;
  replayed: boolean;
}

export function uploadFiscalDocumentXML(
  token: string,
  organizationId: string,
  xmlBase64: string,
  companyId?: string
) {
  return apiFetch<UploadFiscalDocumentXMLResult>(`/v1/organizations/${organizationId}/fiscal_documents/upload`, {
    method: 'POST',
    token,
    body: {
      xml_base64: xmlBase64,
      ...(companyId ? { organization_company_id: companyId } : {})
    }
  });
}

// Only documents brought in through uploadFiscalDocumentXML (source_system
// "manual_upload") can be deleted — the backend rejects anything else, so
// re-importing a test XML doesn't collide on its own idempotency key.
export function deleteFiscalDocument(token: string, organizationId: string, documentId: string) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/fiscal_documents/${documentId}`, {
    method: 'DELETE',
    token
  });
}

export function getFiscalDocument(token: string, organizationId: string, documentId: string) {
  return apiFetch<ApiFiscalDocument>(`/v1/organizations/${organizationId}/fiscal_documents/${documentId}`, {
    token
  });
}

export function listDocumentEvents(token: string, organizationId: string, documentId: string) {
  return apiFetch<{ items: ApiDocumentEvent[] }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/events`,
    { token }
  );
}

export async function downloadFiscalDocument(token: string, organizationId: string, documentId: string) {
  const { blob, filename } = await apiFetchBlob(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/download`,
    { token }
  );
  triggerBlobDownload(blob, filename);
}

export async function downloadFiscalDocumentsZip(token: string, organizationId: string, documentIds: string[]) {
  const { blob, filename } = await apiFetchBlob(
    `/v1/organizations/${organizationId}/fiscal_documents/download_zip`,
    { token, method: 'POST', body: { document_ids: documentIds } }
  );
  triggerBlobDownload(blob, filename);
}

export function listPendingFiscalDocuments(token: string, organizationId: string, limit?: number) {
  const query = new URLSearchParams();
  if (limit) query.set('limit', String(limit));
  const qs = query.toString();
  return apiFetch<{ items: ApiPendingFiscalDocument[] }>(
    `/v1/organizations/${organizationId}/fiscal_documents/pending${qs ? `?${qs}` : ''}`,
    { token }
  );
}

// Sends Ciência da Operação only — an acknowledgement that unlocks the full
// XML, not an agreement with the note's contents (see the manifestation
// design discussion linked from docs/architecture/22_nfe_gateway_service.md).
// The nfe-gateway processes this asynchronously; poll/refetch
// listPendingFiscalDocuments to see the status move to 'manifested'.
export function requestFiscalDocumentManifestation(
  token: string,
  organizationId: string,
  companyId: string,
  pendingDocumentId: string
) {
  return apiFetch<{ id: string; status: string }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/fiscal_documents/pending/${pendingDocumentId}/manifest`,
    { method: 'POST', token }
  );
}

export interface CreateFiscalDocumentQueryInput {
  type: FiscalQueryType;
  nsu?: number;
  chaves?: string[];
}

export function createFiscalDocumentQuery(
  token: string,
  organizationId: string,
  companyId: string,
  input: CreateFiscalDocumentQueryInput
) {
  return apiFetch<ApiFiscalDocumentQuery>(
    `/v1/organizations/${organizationId}/companies/${companyId}/fiscal_document_queries`,
    { token, method: 'POST', body: input }
  );
}

export function listFiscalDocumentQueries(token: string, organizationId: string, limit?: number) {
  const query = limit ? `?limit=${limit}` : '';
  return apiFetch<{ items: ApiFiscalDocumentQuery[] }>(
    `/v1/organizations/${organizationId}/fiscal_document_queries${query}`,
    { token }
  );
}

export function getFiscalDocumentQuery(token: string, organizationId: string, queryId: string) {
  return apiFetch<ApiFiscalDocumentQueryDetail>(
    `/v1/organizations/${organizationId}/fiscal_document_queries/${queryId}`,
    { token }
  );
}

export function listNotifications(token: string, unreadOnly?: boolean, limit?: number) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread', 'true');
  if (limit) params.set('limit', String(limit));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<{ items: ApiNotification[] }>(`/v1/notifications${query}`, { token });
}

export function getUnreadNotificationCount(token: string) {
  return apiFetch<{ unread_count: number }>('/v1/notifications/unread_count', { token });
}

export function markNotificationRead(token: string, notificationId: string) {
  return apiFetch<ApiNotification>(`/v1/notifications/${notificationId}/read`, { token, method: 'POST' });
}

export function markAllNotificationsRead(token: string) {
  return apiFetch<{ marked_read: number }>('/v1/notifications/read_all', { token, method: 'POST' });
}

export function listCompanies(token: string, organizationId: string) {
  return apiFetch<{ items: ApiCompany[] }>(`/v1/organizations/${organizationId}/companies`, { token });
}

export interface CreateCompanyInput {
  legal_name: string;
  trade_name?: string;
  cnpj: string;
  uf: string;
  environment: 'production' | 'homologation';
}

export function createCompany(token: string, organizationId: string, input: CreateCompanyInput) {
  return apiFetch<ApiCompany>(`/v1/organizations/${organizationId}/companies`, {
    method: 'POST',
    token,
    body: input
  });
}

export function updateCompanyStatus(
  token: string,
  organizationId: string,
  companyId: string,
  status: 'active' | 'disabled'
) {
  return apiFetch<ApiCompany>(`/v1/organizations/${organizationId}/companies/${companyId}`, {
    method: 'PATCH',
    token,
    body: { status }
  });
}

export interface UpdateCompanyDetailsInput {
  legal_name: string;
  trade_name?: string;
  uf: string;
  environment: 'production' | 'homologation';
}

export function updateCompanyDetails(
  token: string,
  organizationId: string,
  companyId: string,
  input: UpdateCompanyDetailsInput
) {
  return apiFetch<ApiCompany>(`/v1/organizations/${organizationId}/companies/${companyId}/details`, {
    method: 'PATCH',
    token,
    body: input
  });
}

export function listCompanyServices(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiCompanyService[] }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/services`,
    { token }
  );
}

export function updateCompanyServiceStatus(
  token: string,
  organizationId: string,
  companyId: string,
  serviceId: string,
  status: 'active' | 'disabled'
) {
  return apiFetch<ApiCompanyService>(
    `/v1/organizations/${organizationId}/companies/${companyId}/services/${serviceId}`,
    { method: 'PATCH', token, body: { status } }
  );
}

export function listCertificates(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiCertificate[] }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/certificates`,
    { token }
  );
}

// Estado do cursor de NSU + log de tentativas de consulta à SEFAZ para a
// empresa — governança da distribuição automática (e das consultas sob
// demanda do query_worker, que gravam no mesmo log). Só leitura: quem
// escreve é o nfe-gateway (Python), não este backend.
export function getNfeDistributionStatus(
  token: string,
  organizationId: string,
  companyId: string,
  limit?: number
) {
  const query = limit ? `?limit=${limit}` : '';
  return apiFetch<ApiNfeDistributionStatus>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfe_distribution${query}`,
    { token }
  );
}

export function getActiveCertificate(token: string, organizationId: string, companyId: string) {
  return apiFetch<ApiCertificate>(
    `/v1/organizations/${organizationId}/companies/${companyId}/certificates/active`,
    { token }
  );
}

export function uploadCertificate(
  token: string,
  organizationId: string,
  companyId: string,
  certificateBase64: string,
  password: string
) {
  return apiFetch<ApiCertificate>(
    `/v1/organizations/${organizationId}/companies/${companyId}/certificates`,
    {
      method: 'POST',
      token,
      body: { certificate_base64: certificateBase64, password }
    }
  );
}

export function revokeCertificate(
  token: string,
  organizationId: string,
  companyId: string,
  certificateId: string
) {
  return apiFetch<ApiCertificate>(
    `/v1/organizations/${organizationId}/companies/${companyId}/certificates/${certificateId}/revoke`,
    { method: 'POST', token }
  );
}

// --- Fiscal inbound orchestrator: scenarios, orchestration view, manual
// correction, execution plan. See backend/internal/inbound and
// docs/architecture/21_fiscal_inbound_orchestrator.md.

export interface InboundScenarioRuleInput {
  po_reference_policy: string;
  po_reference_level: string;
  po_missing_action: string;
  po_resolution_mode: string;
  po_not_found_action: string;
  validate_vendor: boolean;
  vendor_failure_action: string;
  vendor_override_allowed: boolean;
  validate_material: boolean;
  material_failure_action: string;
  material_override_allowed: boolean;
  validate_quantity: boolean;
  quantity_tolerance_percent: number;
  validate_price: boolean;
  price_tolerance_percent: number;
  validate_tax: boolean;
  tax_failure_action: string;
  receipt_mode: string;
  inbound_delivery_mode: string;
  goods_receipt_mode: string;
  goods_receipt_movement_type: string;
  supplier_invoice_mode: string;
  notify_on_reject: boolean;
  create_occurrence_on_reject: boolean;
  notify_vendor_on_reject: boolean;
  sefaz_event_on_reject: boolean;
  responsible_emails: string[];
}

export interface CreateInboundScenarioInput {
  organization_company_id: string;
  document_model?: string;
  purchase_order_type?: string;
  cfop?: string;
  vendor_cnpj?: string;
  plant?: string;
  purchasing_organization?: string;
  process_template_code: string;
  rule: InboundScenarioRuleInput;
}

export interface UpdateInboundScenarioInput {
  organization_company_id: string;
  document_model?: string;
  purchase_order_type?: string;
  cfop?: string;
  vendor_cnpj?: string;
  plant?: string;
  purchasing_organization?: string;
  process_template_code: string;
  is_active: boolean;
  rule: InboundScenarioRuleInput;
}

export function listInboundScenarios(token: string, organizationId: string) {
  return apiFetch<{ items: ApiInboundScenarioWithRule[] }>(
    `/v1/organizations/${organizationId}/inbound-scenarios`,
    { token }
  );
}

export function getInboundScenario(token: string, organizationId: string, scenarioId: string) {
  return apiFetch<ApiInboundScenarioWithRule>(
    `/v1/organizations/${organizationId}/inbound-scenarios/${scenarioId}`,
    { token }
  );
}

export function createInboundScenario(
  token: string,
  organizationId: string,
  input: CreateInboundScenarioInput
) {
  return apiFetch<ApiInboundScenarioWithRule>(
    `/v1/organizations/${organizationId}/inbound-scenarios`,
    { method: 'POST', token, body: input }
  );
}

export function updateInboundScenario(
  token: string,
  organizationId: string,
  scenarioId: string,
  input: UpdateInboundScenarioInput
) {
  return apiFetch<ApiInboundScenarioWithRule>(
    `/v1/organizations/${organizationId}/inbound-scenarios/${scenarioId}`,
    { method: 'PATCH', token, body: input }
  );
}

export function deleteInboundScenario(token: string, organizationId: string, scenarioId: string) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/inbound-scenarios/${scenarioId}`, {
    method: 'DELETE',
    token
  });
}

export function listVendorMaterialMappings(token: string, organizationId: string) {
  return apiFetch<{ items: ApiVendorMaterialMapping[] }>(
    `/v1/organizations/${organizationId}/vendor-material-mappings`,
    { token }
  );
}

export interface UpsertVendorMaterialMappingInput {
  organization_company_id?: string;
  vendor_cnpj: string;
  supplier_material_code: string;
  resolved_material_code: string;
}

export function upsertVendorMaterialMapping(
  token: string,
  organizationId: string,
  input: UpsertVendorMaterialMappingInput
) {
  return apiFetch<ApiVendorMaterialMapping>(
    `/v1/organizations/${organizationId}/vendor-material-mappings`,
    { method: 'POST', token, body: input }
  );
}

export function getOrchestration(token: string, organizationId: string, documentId: string) {
  return apiFetch<ApiOrchestrationView>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/orchestration`,
    { token }
  );
}

export interface PatchInboundItemInput {
  supplier_material_code?: string | null;
  description?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  purchase_order_reference_raw?: string | null;
  purchase_order_item_reference_raw?: string | null;
}

export function patchInboundItem(
  token: string,
  organizationId: string,
  documentId: string,
  itemId: string,
  input: PatchInboundItemInput
) {
  return apiFetch<unknown>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/items/${itemId}`,
    { method: 'PATCH', token, body: input }
  );
}

export type InboundOverrideType =
  | 'VENDOR'
  | 'MATERIAL'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_ORDER_ITEM'
  | 'QUANTITY'
  | 'PRICE';

export interface ApplyInboundOverrideInput {
  item_id?: string;
  override_type: InboundOverrideType;
  override_value: string;
  purchase_order_item?: string;
  reason: string;
  save_as_mapping?: boolean;
  organization_company_id?: string;
  vendor_cnpj?: string;
}

export function applyInboundOverride(
  token: string,
  organizationId: string,
  documentId: string,
  input: ApplyInboundOverrideInput
) {
  return apiFetch<ApiInboundOverride>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/override`,
    { method: 'POST', token, body: input }
  );
}

export function searchPurchaseOrders(
  token: string,
  organizationId: string,
  documentId: string,
  params: { purchaseOrder?: string; vendorCnpj?: string }
) {
  const query = new URLSearchParams();
  if (params.purchaseOrder) query.set('purchase_order', params.purchaseOrder);
  if (params.vendorCnpj) query.set('vendor_cnpj', params.vendorCnpj);
  return apiFetch<{ items: ApiPurchaseOrder[] }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/purchase-orders/search?${query.toString()}`,
    { token }
  );
}

export function reprocessInboundDocument(token: string, organizationId: string, documentId: string) {
  return apiFetch<ApiOrchestrationView>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/reprocess`,
    { method: 'POST', token }
  );
}

export function buildExecutionPlan(token: string, organizationId: string, documentId: string) {
  return apiFetch<{ plan: ApiExecutionPlan; steps: ApiPlanStep[] }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/plan`,
    { method: 'POST', token }
  );
}

export interface AdvanceInboundStepInput {
  action?: 'run' | 'skip';
  manual_document_number?: string;
  reason?: string;
}

export function advanceInboundStep(
  token: string,
  organizationId: string,
  documentId: string,
  stepId: string,
  input: AdvanceInboundStepInput = {}
) {
  return apiFetch<ApiPlanStep>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/steps/${stepId}/advance`,
    { method: 'POST', token, body: input }
  );
}

export function rejectInboundDocument(
  token: string,
  organizationId: string,
  documentId: string,
  reason: string
) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/fiscal_documents/${documentId}/reject`, {
    method: 'POST',
    token,
    body: { reason }
  });
}
