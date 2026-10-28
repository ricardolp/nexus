import { apiFetch, apiFetchBlob, triggerBlobDownload } from './api';
import type {
  ApiAuthSettings,
  ApiCompanyNFSeProviderSettings,
  ApiNFSeMunicipalProvider,
  ApiNFSeProviderDescriptor,
  ApiNFSeProviderRoute,
  ApiCertificate,
  ApiCompany,
  ApiCompanyNFSeService,
  ApiOrganizationService,
  ApiCustomer,
  ApiDocumentEvent,
  ApiExecutionPlan,
  ApiFiscalDocument,
  ApiFiscalDocumentQuery,
  ApiFiscalDocumentQueryDetail,
  ApiInboundOverride,
  ApiInboundItem,
  ApiInboundScenarioWithRule,
  ApiAPIClient,
  ApiIntegration,
  ApiIntegrationConfiguration,
  CreatedApiClient,
  RotatedInboundToken,
  ApiInvitation,
  ApiMember,
  ApiMemberRole,
  ApiMaterial,
  ApiMaterialUOM,
  ApiNfeDistributionStatus,
  ApiNotification,
  ApiOrchestrationView,
  ApiOrganization,
  ApiOrganizationUsage,
  ApiCompanyUsage,
  ApiBillingStatement,
  ApiEmailCredentials,
  ApiEmailMessage,
  ApiEmailTemplate,
  ApiEmailToken,
  ApiPasswordPolicy,
  ApiPendingFiscalDocument,
  ApiPlanStep,
  ApiFaqMessage,
  ApiFaqMissingHit,
  ApiFaqTopHit,
  ApiPlatformError,
  ApiPlatformStatus,
  ApiPurchaseOrder,
  ApiRequestTrace,
  ApiIntegrationLog,
  ApiIntegrationLogList,
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

export function getEmailCredentials(token: string, organizationId: string) {
  return apiFetch<ApiEmailCredentials>(`/v1/organizations/${organizationId}/email-credentials`, { token });
}

export function updateEmailCredentials(
  token: string,
  organizationId: string,
  body: {
    host: string;
    port: number;
    username: string;
    password?: string | null;
    from_name: string;
    from_address: string;
    status: string;
  }
) {
  return apiFetch<ApiEmailCredentials>(`/v1/organizations/${organizationId}/email-credentials`, {
    method: 'PUT',
    token,
    body
  });
}

export function testEmailCredentials(token: string, organizationId: string, to: string) {
  return apiFetch<{ status: string }>(`/v1/organizations/${organizationId}/email-credentials/test`, {
    method: 'POST',
    token,
    body: { to }
  });
}

export function listEmailTokens(token: string, organizationId: string) {
  return apiFetch<{ items: ApiEmailToken[] }>(`/v1/organizations/${organizationId}/email-tokens`, { token });
}

export function listCompanyEmailTemplates(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiEmailTemplate[] }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/email-templates`,
    { token }
  );
}

export function updateCompanyEmailTemplate(
  token: string,
  organizationId: string,
  companyId: string,
  processCode: string,
  body: Partial<{
    enabled: boolean;
    subject: string;
    to_addresses: string[];
    cc_addresses: string[];
    body_html: string;
    from_name: string | null;
    from_address: string | null;
    clear_from_override: boolean;
    attach_xml: boolean;
    attach_danfe_sefaz: boolean;
    attach_danfe_custom: boolean;
    use_partner_email: boolean;
    use_recipient_email: boolean;
  }>
) {
  return apiFetch<ApiEmailTemplate>(
    `/v1/organizations/${organizationId}/companies/${companyId}/email-templates/${processCode}`,
    { method: 'PATCH', token, body }
  );
}

export function listEmailMessages(
  token: string,
  organizationId: string,
  params?: { company_id?: string; process_code?: string; status?: string; q?: string; limit?: number }
) {
  const qs = new URLSearchParams();
  if (params?.company_id) qs.set('company_id', params.company_id);
  if (params?.process_code) qs.set('process_code', params.process_code);
  if (params?.status) qs.set('status', params.status);
  if (params?.q) qs.set('q', params.q);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch<{ items: ApiEmailMessage[] }>(`/v1/organizations/${organizationId}/email-messages${suffix}`, {
    token
  });
}

export function getEmailMessage(token: string, organizationId: string, messageId: string) {
  return apiFetch<ApiEmailMessage>(`/v1/organizations/${organizationId}/email-messages/${messageId}`, { token });
}

export function downloadEmailAttachment(
  token: string,
  organizationId: string,
  messageId: string,
  attachmentId: string
) {
  return apiFetchBlob(
    `/v1/organizations/${organizationId}/email-messages/${messageId}/attachments/${attachmentId}/download`,
    { token }
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

/** Logo da organização no switcher / página Organização (não é a logo DANFE/DANFSe). */
export function uploadOrganizationLogo(token: string, organizationId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<ApiOrganization>(`/v1/organizations/${organizationId}/logo`, {
    method: 'POST',
    token,
    formData
  });
}

export function deleteOrganizationLogo(token: string, organizationId: string) {
  return apiFetch<ApiOrganization>(`/v1/organizations/${organizationId}/logo`, {
    method: 'DELETE',
    token
  });
}

export function getOrganizationLogoBlob(token: string, organizationId: string) {
  return apiFetchBlob(`/v1/organizations/${organizationId}/logo`, { token });
}

export function listOrganizations(token: string) {
  return apiFetch<{ items: ApiOrganization[] }>('/v1/organizations', { token });
}

export function createOrganization(
  token: string,
  body: {
    legal_name: string;
    trade_name?: string;
    slug: string;
    tax_identifier?: string;
  }
) {
  return apiFetch<ApiOrganization>('/v1/organizations', {
    method: 'POST',
    token,
    body
  });
}

export function listMyOrganizations(token: string) {
  return apiFetch<{ items: ApiOrganization[] }>('/v1/users/me/organizations', { token });
}

export function listUserOrganizations(token: string, userId: string) {
  return apiFetch<{ items: ApiOrganization[] }>(`/v1/users/${userId}/organizations`, { token });
}

export function switchOrganization(token: string, organizationId: string) {
  return apiFetch<LoginResponse>('/v1/auth/switch-organization', {
    method: 'POST',
    token,
    body: { organization_id: organizationId }
  });
}

export function listSupportMembers(token: string, organizationId: string) {
  return apiFetch<{ items: ApiMember[] }>(`/v1/organizations/${organizationId}/support-members`, {
    token
  });
}

export function addSupportMember(
  token: string,
  organizationId: string,
  body: { email?: string; user_id?: string }
) {
  return apiFetch<ApiMember>(`/v1/organizations/${organizationId}/support-members`, {
    method: 'POST',
    token,
    body
  });
}

export function removeSupportMember(token: string, organizationId: string, memberId: string) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/support-members/${memberId}`, {
    method: 'DELETE',
    token
  });
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

export function listIntegrationLogs(
  token: string,
  organizationId: string,
  params?: {
    page?: number;
    limit?: number;
    level?: string;
    direction?: string;
    q?: string;
  }
) {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.level) qs.set('level', params.level);
  if (params?.direction) qs.set('direction', params.direction);
  if (params?.q) qs.set('q', params.q);
  const query = qs.toString();
  return apiFetch<ApiIntegrationLogList>(
    `/v1/organizations/${organizationId}/integration_logs${query ? `?${query}` : ''}`,
    { token }
  );
}

export function getIntegrationLog(token: string, organizationId: string, logId: string) {
  return apiFetch<ApiIntegrationLog>(
    `/v1/organizations/${organizationId}/integration_logs/${logId}`,
    { token }
  );
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

export function listFaqMessages(
  token: string,
  params?: { source?: string; code?: string; q?: string; active?: boolean; limit?: number }
) {
  const qs = new URLSearchParams();
  if (params?.source) qs.set('source', params.source);
  if (params?.code) qs.set('code', params.code);
  if (params?.q) qs.set('q', params.q);
  if (params?.active != null) qs.set('active', String(params.active));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<{ items: ApiFaqMessage[] }>(
    `/v1/platform/faq/messages${query ? `?${query}` : ''}`,
    { token }
  );
}

export function getFaqMessage(token: string, id: string) {
  return apiFetch<ApiFaqMessage>(`/v1/platform/faq/messages/${id}`, { token });
}

export type FaqMessageInput = {
  source: string;
  code: string;
  docsta?: string;
  lang?: string;
  severity: string;
  title: string;
  summary: string;
  steps?: string[];
  forbidden_actions?: string[];
  recommended_action?: string;
  faq_slug?: string | null;
  active?: boolean;
};

export function createFaqMessage(token: string, body: FaqMessageInput) {
  return apiFetch<ApiFaqMessage>('/v1/platform/faq/messages', {
    method: 'POST',
    token,
    body
  });
}

export function updateFaqMessage(token: string, id: string, body: FaqMessageInput) {
  return apiFetch<ApiFaqMessage>(`/v1/platform/faq/messages/${id}`, {
    method: 'PUT',
    token,
    body
  });
}

export function setFaqMessageActive(token: string, id: string, active: boolean) {
  return apiFetch<ApiFaqMessage>(`/v1/platform/faq/messages/${id}/active`, {
    method: 'PATCH',
    token,
    body: { active }
  });
}

export function listFaqMissingHits(
  token: string,
  params?: { organization_id?: string; limit?: number }
) {
  const qs = new URLSearchParams();
  if (params?.organization_id) qs.set('organization_id', params.organization_id);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<{ items: ApiFaqMissingHit[] }>(
    `/v1/platform/faq/hits/missing${query ? `?${query}` : ''}`,
    { token }
  );
}

export function listFaqTopHits(
  token: string,
  params?: { organization_id?: string; limit?: number }
) {
  const qs = new URLSearchParams();
  if (params?.organization_id) qs.set('organization_id', params.organization_id);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<{ items: ApiFaqTopHit[] }>(
    `/v1/platform/faq/hits/top${query ? `?${query}` : ''}`,
    { token }
  );
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

export interface FiscalDocumentListCounts {
  all: number;
  action_needed: number;
  in_progress: number;
  completed: number;
  problem: number;
}

export interface ListFiscalDocumentsParams {
  documentType: 'nfe' | 'nfse';
  status?: string;
  statusGroup?: 'action_needed' | 'in_progress' | 'completed' | 'problem';
  direction?: 'inbound' | 'outbound';
  q?: string;
  fields?: string;
  number?: string;
  partner?: string;
  accessKey?: string;
  numberFrom?: string;
  numberTo?: string;
  limit?: number;
  offset?: number;
}

export function listFiscalDocuments(
  token: string,
  organizationId: string,
  params: ListFiscalDocumentsParams
) {
  const query = new URLSearchParams({ document_type: params.documentType });
  if (params.status) query.set('status', params.status);
  if (params.direction) query.set('direction', params.direction);
  if (params.q) query.set('q', params.q);
  if (params.fields) query.set('fields', params.fields);
  if (params.statusGroup) query.set('status_group', params.statusGroup);
  if (params.number) query.set('number', params.number);
  if (params.partner) query.set('partner', params.partner);
  if (params.accessKey) query.set('access_key', params.accessKey);
  if (params.numberFrom) query.set('number_from', params.numberFrom);
  if (params.numberTo) query.set('number_to', params.numberTo);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  return apiFetch<{ items: ApiFiscalDocument[]; total?: number; counts?: FiscalDocumentListCounts }>(
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

/** Uploads one inbound NF-e XML. 409 duplicate_access_key when the chave already exists. */
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

export interface CreateOutboundNFSeResult {
  document_id: string;
  trace_id: string;
  status: string;
  replayed?: boolean;
}

/** Emits NFS-e de saída from the Nexus UI (nested SAP JSON body). */
export function createOutboundNFSe(
  token: string,
  organizationId: string,
  companyId: string,
  payload: Record<string, unknown>,
  idempotencyKey: string
) {
  return apiFetch<CreateOutboundNFSeResult>(
    `/v1/organizations/${organizationId}/companies/${companyId}/fiscal_documents/nfse`,
    {
      method: 'POST',
      token,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: payload
    }
  );
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

export function resubmitOutboundDocument(token: string, organizationId: string, documentId: string) {
  return apiFetch<{ document_id: string; status: string; processing_status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/resubmit`,
    { method: 'POST', token }
  );
}

/** Stops outbound processing before the note is sent to SEFAZ/SEFIN. Admin only. */
export function abortOutboundProcessing(token: string, organizationId: string, documentId: string) {
  return apiFetch<{ document_id: string; status: string; processing_status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/abort_processing`,
    { method: 'POST', token }
  );
}

/** Requests SEFIN cancelamento (101101) for an authorized outbound NFS-e. */
export function cancelOutboundNFSe(
  token: string,
  organizationId: string,
  documentId: string,
  body: { c_motivo: '1' | '2' | '9'; justificativa: string }
) {
  return apiFetch<{ document_id: string; status: string; processing_status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/cancel`,
    { method: 'POST', token, body }
  );
}

/** Requests SEFAZ cancelamento (110111) for an authorized outbound NF-e. */
export function cancelOutboundNFe(
  token: string,
  organizationId: string,
  documentId: string,
  body: { justificativa: string }
) {
  return apiFetch<{ document_id: string; status: string; processing_status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/cancel`,
    { method: 'POST', token, body }
  );
}

/** Requests SEFAZ Carta de Correção (110110) for an authorized outbound NF-e. */
export function requestOutboundCCe(
  token: string,
  organizationId: string,
  documentId: string,
  body: { correcao: string; n_seq_evento?: number }
) {
  return apiFetch<{ document_id: string; status: string; processing_status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/cce`,
    { method: 'POST', token, body }
  );
}

/** On-demand ConsultaProtocolo — stores protNFe for download. */
export function requestOutboundProtocol(token: string, organizationId: string, documentId: string) {
  return apiFetch<{ document_id: string; status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/request_protocol`,
    { method: 'POST', token }
  );
}

/** Company-scoped NF-e number range inutilization. */
export function requestNFeInutilization(
  token: string,
  organizationId: string,
  body: {
    organization_company_id: string;
    serie: string;
    numero_inicial: number;
    numero_final: number;
    ano: number;
    justificativa: string;
    document_id?: string;
  }
) {
  return apiFetch<{ status: string }>(
    `/v1/organizations/${organizationId}/fiscal_documents/inutilization`,
    { method: 'POST', token, body }
  );
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

export async function downloadFiscalDocument(
  token: string,
  organizationId: string,
  documentId: string,
  payloadType?: string
) {
  const qs = payloadType ? `?payload_type=${encodeURIComponent(payloadType)}` : '';
  const { blob, filename } = await apiFetchBlob(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/download${qs}`,
    { token }
  );
  triggerBlobDownload(blob, filename);
}

export async function readFiscalDocumentPayload(
  token: string,
  organizationId: string,
  documentId: string,
  payloadType: string
) {
  const { blob, filename } = await apiFetchBlob(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/download?payload_type=${encodeURIComponent(payloadType)}`,
    { token }
  );
  return { text: await blob.text(), filename, contentType: blob.type };
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
  municipal_registration?: string;
  ibge_municipality_code?: string;
  tax_regime?: string;
  special_tax_regime?: string;
  danfse_custom_logo_enabled?: boolean;
  danfe_custom_logo_enabled?: boolean;
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

/** Logo única da empresa: o backend gera uma cópia para a DANFSe e outra para a DANFE. */
export function uploadCompanyLogo(token: string, organizationId: string, companyId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<ApiCompany>(`/v1/organizations/${organizationId}/companies/${companyId}/logo`, {
    method: 'POST',
    token,
    formData
  });
}

export function deleteCompanyLogo(token: string, organizationId: string, companyId: string) {
  return apiFetch<ApiCompany>(`/v1/organizations/${organizationId}/companies/${companyId}/logo`, {
    method: 'DELETE',
    token
  });
}

export function getCompanyLogoBlob(token: string, organizationId: string, companyId: string) {
  return apiFetchBlob(`/v1/organizations/${organizationId}/companies/${companyId}/logo`, { token });
}

export function listCustomers(
  token: string,
  organizationId: string,
  q?: string,
  opts?: { includeHistory?: boolean }
) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (opts?.includeHistory === false) params.set('include_history', 'false');
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<{ items: ApiCustomer[] }>(`/v1/organizations/${organizationId}/customers${qs}`, { token });
}

export type CreateCustomerInput = {
  cpf?: string;
  cnpj?: string;
  nif?: string;
  legal_name: string;
  email?: string;
  phone?: string;
  municipal_registration?: string;
  street?: string;
  street_type?: string;
  number?: string;
  complement?: string;
  district?: string;
  municipality_code?: string;
  uf?: string;
  cep?: string;
};

export function lookupCNPJ(token: string, organizationId: string, cnpj: string) {
  const digits = cnpj.replace(/\D/g, '');
  return apiFetch<ApiCNPJLookup>(`/v1/organizations/${organizationId}/lookups/cnpj/${digits}`, { token });
}

export function lookupCEP(token: string, organizationId: string, cep: string) {
  const digits = cep.replace(/\D/g, '');
  return apiFetch<ApiCEPLookup>(`/v1/organizations/${organizationId}/lookups/cep/${digits}`, { token });
}

export interface ApiCNPJLookup {
  cnpj: string;
  legal_name: string;
  trade_name?: string | null;
  status?: string;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  municipality_code?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
  main_activity?: { code: string; description: string; is_primary?: boolean } | null;
  side_activities?: { code: string; description: string; is_primary?: boolean }[];
  source?: string;
}

export interface ApiCEPLookup {
  cep: string;
  street: string;
  complement?: string | null;
  district: string;
  city: string;
  uf: string;
  municipality_code: string;
  source?: string;
}

export interface ApiCatalogCNAE {
  code: string;
  description: string;
}

export interface ApiCatalogNBS {
  code: string;
  code_digits?: string;
  description: string;
  suggested?: boolean;
}

export interface ApiCatalogLC116 {
  code: string;
  description: string;
  suggested?: boolean;
}

export interface ApiCatalogMunicipality {
  code: string;
  name: string;
  uf: string;
}

export interface ApiCompanyCNAE {
  id: string;
  organization_id: string;
  organization_company_id: string;
  cnae_code: string;
  cnae_description?: string | null;
  is_primary: boolean;
  enabled: boolean;
  source?: string;
}

export function searchCatalogCNAE(token: string, organizationId: string, q: string, limit = 40) {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<{ items: ApiCatalogCNAE[] }>(
    `/v1/organizations/${organizationId}/catalogs/cnae?${qs}`,
    { token }
  );
}

export function searchCatalogNBS(
  token: string,
  organizationId: string,
  opts: { q?: string; cnae?: string; lc116?: string; suggestedOnly?: boolean; limit?: number } = {}
) {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  if (opts.cnae) qs.set('cnae', opts.cnae);
  if (opts.lc116) qs.set('lc116', opts.lc116);
  if (opts.suggestedOnly) qs.set('suggested_only', '1');
  qs.set('limit', String(opts.limit ?? 50));
  return apiFetch<{ items: ApiCatalogNBS[]; suggested_prefixes?: string[] }>(
    `/v1/organizations/${organizationId}/catalogs/nbs?${qs}`,
    { token }
  );
}

export function searchCatalogLC116(
  token: string,
  organizationId: string,
  opts: { q?: string; cnae?: string; nbs?: string; suggestedOnly?: boolean; limit?: number } = {}
) {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  if (opts.cnae) qs.set('cnae', opts.cnae);
  if (opts.nbs) qs.set('nbs', opts.nbs);
  if (opts.suggestedOnly) qs.set('suggested_only', '1');
  qs.set('limit', String(opts.limit ?? 50));
  return apiFetch<{ items: ApiCatalogLC116[]; suggested_codes?: string[] }>(
    `/v1/organizations/${organizationId}/catalogs/lc116?${qs}`,
    { token }
  );
}

export function searchCatalogMunicipalities(
  token: string,
  organizationId: string,
  opts: { q?: string; uf?: string; limit?: number } = {}
) {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  if (opts.uf) qs.set('uf', opts.uf);
  qs.set('limit', String(opts.limit ?? 40));
  return apiFetch<{ items: ApiCatalogMunicipality[] }>(
    `/v1/organizations/${organizationId}/catalogs/municipalities?${qs}`,
    { token }
  );
}

export function listCompanyCNAEs(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiCompanyCNAE[] }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/cnaes`,
    { token }
  );
}

export function syncCompanyCNAEs(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiCompanyCNAE[] }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/cnaes/sync`,
    { method: 'POST', token }
  );
}

export function updateCompanyCNAE(
  token: string,
  organizationId: string,
  companyId: string,
  cnaeId: string,
  input: { enabled: boolean }
) {
  return apiFetch<ApiCompanyCNAE>(
    `/v1/organizations/${organizationId}/companies/${companyId}/cnaes/${cnaeId}`,
    { method: 'PATCH', token, body: input }
  );
}

export function getCustomer(token: string, organizationId: string, customerId: string) {
  return apiFetch<ApiCustomer>(`/v1/organizations/${organizationId}/customers/${customerId}`, { token });
}

export function createCustomer(token: string, organizationId: string, input: CreateCustomerInput) {
  return apiFetch<ApiCustomer>(`/v1/organizations/${organizationId}/customers`, {
    method: 'POST',
    token,
    body: input
  });
}

export function updateCustomer(
  token: string,
  organizationId: string,
  customerId: string,
  input: CreateCustomerInput & { status?: string }
) {
  return apiFetch<ApiCustomer>(`/v1/organizations/${organizationId}/customers/${customerId}`, {
    method: 'PATCH',
    token,
    body: input
  });
}

export function listMaterials(token: string, organizationId: string, q?: string, code?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (code?.trim()) params.set('code', code.trim());
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<{ items: ApiMaterial[] }>(`/v1/organizations/${organizationId}/materials${qs}`, { token });
}

export function getMaterial(token: string, organizationId: string, materialId: string) {
  return apiFetch<ApiMaterial>(`/v1/organizations/${organizationId}/materials/${materialId}`, { token });
}

export type UpsertMaterialInput = {
  material_code?: string;
  supplier_material_code?: string;
  description?: string;
  base_unit?: string;
  ncm?: string;
};

export function createMaterial(token: string, organizationId: string, input: UpsertMaterialInput) {
  return apiFetch<ApiMaterial>(`/v1/organizations/${organizationId}/materials`, {
    method: 'POST',
    token,
    body: input
  });
}

export function updateMaterial(
  token: string,
  organizationId: string,
  materialId: string,
  input: UpsertMaterialInput
) {
  return apiFetch<ApiMaterial>(`/v1/organizations/${organizationId}/materials/${materialId}`, {
    method: 'PATCH',
    token,
    body: input
  });
}

export type UpsertMaterialUOMInput = {
  alternative_unit: string;
  base_unit?: string;
  numerator: number;
  denominator: number;
};

export function createMaterialUOM(
  token: string,
  organizationId: string,
  materialId: string,
  input: UpsertMaterialUOMInput
) {
  return apiFetch<ApiMaterialUOM>(`/v1/organizations/${organizationId}/materials/${materialId}/uoms`, {
    method: 'POST',
    token,
    body: input
  });
}

export function updateMaterialUOM(
  token: string,
  organizationId: string,
  materialId: string,
  uomId: string,
  input: UpsertMaterialUOMInput
) {
  return apiFetch<ApiMaterialUOM>(
    `/v1/organizations/${organizationId}/materials/${materialId}/uoms/${uomId}`,
    { method: 'PATCH', token, body: input }
  );
}

export function deleteMaterialUOM(token: string, organizationId: string, materialId: string, uomId: string) {
  return apiFetch<void>(`/v1/organizations/${organizationId}/materials/${materialId}/uoms/${uomId}`, {
    method: 'DELETE',
    token
  });
}

export function listCompanyNFSeServices(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiCompanyNFSeService[] }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse_services`,
    { token }
  );
}

export type UpsertCompanyNFSeServiceInput = {
  cnae_code: string;
  cnae_description?: string;
  service_list_item?: string;
  service_description?: string;
  nbs_code?: string;
  nbs_description?: string;
  default_iss_aliquot?: number | null;
  default_discrimination?: string;
  is_primary?: boolean;
  is_favorite?: boolean;
  sort_order?: number;
  status?: string;
};

export function createCompanyNFSeService(
  token: string,
  organizationId: string,
  companyId: string,
  input: UpsertCompanyNFSeServiceInput
) {
  return apiFetch<ApiCompanyNFSeService>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse_services`,
    { method: 'POST', token, body: input }
  );
}

export function updateCompanyNFSeService(
  token: string,
  organizationId: string,
  companyId: string,
  serviceId: string,
  input: UpsertCompanyNFSeServiceInput
) {
  return apiFetch<ApiCompanyNFSeService>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse_services/${serviceId}`,
    { method: 'PATCH', token, body: input }
  );
}

export function deleteCompanyNFSeService(
  token: string,
  organizationId: string,
  companyId: string,
  serviceId: string
) {
  return apiFetch<void>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse_services/${serviceId}`,
    { method: 'DELETE', token }
  );
}

export function suggestNextRPS(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ serie_rps: string; numero_rps: string; from_last: boolean }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse/next_rps`,
    { token }
  );
}

export function getLastNFSeClassification(
  token: string,
  organizationId: string,
  companyId: string,
  cnae?: string
) {
  const qs = new URLSearchParams();
  if (cnae) qs.set('cnae', cnae);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch<{
    found: boolean;
    cnae_code?: string;
    item_lista_servico?: string;
    codigo_nbs?: string;
    nbs_description?: string | null;
  }>(`/v1/organizations/${organizationId}/companies/${companyId}/nfse/last_classification${suffix}`, {
    token
  });
}

export type SuggestNFSeClassificationInput = {
  cnae_code: string;
  draft_discrimination?: string;
  current_nbs?: string;
  current_lc116?: string;
  customer_id?: string;
};

export type SuggestNFSeClassificationResult = {
  codigo_nbs: string;
  nbs_description: string;
  item_lista_servico: string;
  lc116_description: string;
  discriminacao: string;
  rationale: string;
  confidence: number;
  source: string;
};

export function suggestNFSeClassification(
  token: string,
  organizationId: string,
  companyId: string,
  body: SuggestNFSeClassificationInput
) {
  return apiFetch<SuggestNFSeClassificationResult>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse/suggest_classification`,
    {
      method: 'POST',
      token,
      body
    }
  );
}

export function listOrganizationServices(token: string, organizationId: string) {
  return apiFetch<{ items: ApiOrganizationService[] }>(
    `/v1/organizations/${organizationId}/services`,
    { token }
  );
}

export function updateOrganizationServiceStatus(
  token: string,
  organizationId: string,
  serviceId: string,
  status: 'active' | 'disabled'
) {
  return apiFetch<ApiOrganizationService>(
    `/v1/organizations/${organizationId}/services/${serviceId}`,
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

export function setInboundItemAlternativeUnit(
  token: string,
  organizationId: string,
  documentId: string,
  itemId: string,
  unit: string
) {
  return apiFetch<ApiInboundItem>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/items/${itemId}/alternative_unit`,
    { method: 'PATCH', token, body: { unit } }
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

export function resetInboundDocument(token: string, organizationId: string, documentId: string) {
  return apiFetch<ApiOrchestrationView>(
    `/v1/organizations/${organizationId}/fiscal_documents/${documentId}/reset`,
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


// Provedores municipais de NFS-e (catálogo + credenciais do webservice da prefeitura por empresa).
export function listNFSeMunicipalProviders(token: string) {
  return apiFetch<{ items: ApiNFSeMunicipalProvider[]; providers: ApiNFSeProviderDescriptor[] }>(
    '/v1/nfse/municipal-providers',
    { token }
  );
}

export function listCompanyNFSeProviderSettings(token: string, organizationId: string, companyId: string) {
  return apiFetch<{ items: ApiCompanyNFSeProviderSettings[]; route?: ApiNFSeProviderRoute }>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse-provider-settings`,
    { token }
  );
}

export interface UpsertCompanyNFSeProviderSettingsInput {
  username?: string;
  /** Ausente mantém a senha atual; "" apaga. */
  password?: string;
  config_overrides?: Record<string, unknown>;
  force_route?: boolean;
}

export function upsertCompanyNFSeProviderSettings(
  token: string,
  organizationId: string,
  companyId: string,
  providerCode: string,
  input: UpsertCompanyNFSeProviderSettingsInput
) {
  return apiFetch<ApiCompanyNFSeProviderSettings>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse-provider-settings/${providerCode}`,
    { method: 'PUT', token, body: input }
  );
}

export function deleteCompanyNFSeProviderSettings(
  token: string,
  organizationId: string,
  companyId: string,
  providerCode: string
) {
  return apiFetch<void>(
    `/v1/organizations/${organizationId}/companies/${companyId}/nfse-provider-settings/${providerCode}`,
    { method: 'DELETE', token }
  );
}
