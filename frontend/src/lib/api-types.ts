export type PlatformRole = 'admin' | 'system' | 'support' | 'member';

export interface ApiUser {
  id: string;
  platform_role: PlatformRole;
  email: string;
  email_normalized: string;
  email_verified_at?: string | null;
  status: 'active' | 'pending' | 'suspended' | string;
  display_name?: string | null;
  phone?: string | null;
  bio?: string | null;
  timezone?: string | null;
  locale?: string | null;
  has_avatar?: boolean;
  appearance_json?: Record<string, unknown> | null;
  notification_preferences_json?: Record<string, unknown> | null;
  mfa_enabled?: boolean;
  password_changed_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiOrganization {
  id: string;
  legal_name: string;
  trade_name?: string | null;
  slug: string;
  tax_identifier?: string | null;
  logo_url?: string | null;
  status: string;
  timezone: string;
  default_locale: string;
  created_at: string;
  updated_at: string;
}

export interface ApiOrganizationUsage {
  organization_id: string;
  legal_name: string;
  slug: string;
  status: string;
  companies_count: number;
  members_count: number;
  documents_count: number;
  documents_last_24h: number;
  errors_last_24h: number;
  distribution_error_companies: number;
}

export interface ApiCompanyUsage {
  company_id: string;
  legal_name: string;
  cnpj: string;
  status: string;
  documents_count: number;
  documents_last_24h: number;
  last_document_at?: string | null;
  distribution_status?: string | null;
  distribution_last_poll_at?: string | null;
  distribution_last_message?: string | null;
  nsu_backlog?: number | null;
}

export interface ApiBillingMetric {
  code: string;
  label: string;
  unit: string;
  quantity: number;
}

export interface ApiBillingCompany {
  company_id: string;
  legal_name: string;
  trade_name?: string | null;
  cnpj: string;
  total_quantity: number;
  metrics: ApiBillingMetric[];
}

export interface ApiBillingIssuer {
  legal_name: string;
  trade_name: string;
  product_name: string;
  address_lines?: string[];
  city?: string;
  postal_code?: string;
  country?: string;
  email: string;
  website: string;
}

export interface ApiBillingStatement {
  organization_id: string;
  legal_name: string;
  trade_name?: string | null;
  slug: string;
  tax_identifier?: string | null;
  timezone: string;
  period_from: string;
  period_to: string;
  issued_at: string;
  total_quantity: number;
  totals: ApiBillingMetric[];
  companies: ApiBillingCompany[];
  issuer: ApiBillingIssuer;
}

export interface ApiRequestTrace {
  id: string;
  organization_id?: string | null;
  correlation_id: string;
  trace_id: string;
  span_name: string;
  actor_type?: string | null;
  actor_id?: string | null;
  http_method?: string | null;
  http_path?: string | null;
  http_status?: number | null;
  duration_ms?: number | null;
  request_hash?: string | null;
  storage_object_key?: string | null;
  metadata_json?: Record<string, unknown>;
  started_at: string;
  finished_at?: string | null;
  created_at: string;
}

export type PlatformErrorSource = 'document_attempt' | 'inbound_step' | 'nfe_distribution_poll';

export interface ApiPlatformError {
  id: string;
  source: PlatformErrorSource | string;
  organization_id: string;
  company_id?: string | null;
  document_id?: string | null;
  error_code: string;
  error_message: string;
  is_retryable?: boolean | null;
  occurred_at: string;
}

export interface ApiPlatformStatus {
  control_plane: string;
  organizations_active: number;
  organizations_suspended: number;
  documents_last_24h: number;
  errors_last_24h: number;
  distribution: {
    active: number;
    paused: number;
    error: number;
    unknown: number;
  };
  distribution_errors: Array<{
    organization_id: string;
    organization_legal_name: string;
    company_id: string;
    company_legal_name: string;
    cnpj: string;
    last_message?: string | null;
  }>;
  outbox_pending: number;
  outbox_failed: number;
  generated_at: string;
}

export interface ApiRole {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  is_system: boolean;
  is_default: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  permissions: string[];
}

export interface ApiMember {
  id: string;
  user_id: string;
  email: string;
  platform_role: PlatformRole;
  status: 'active' | 'invited' | 'suspended' | string;
  joined_at?: string | null;
  created_at: string;
  invitation_expires_at?: string | null;
  last_login_at?: string | null;
}

export interface ApiMemberRole {
  id: string;
  organization_id: string;
  organization_member_id: string;
  organization_role_id: string;
  role_name: string;
  role_slug: string;
  organization_company_id?: string | null;
  valid_from: string;
  valid_until?: string | null;
  created_at: string;
}

export interface ApiCompany {
  id: string;
  organization_id: string;
  legal_name: string;
  trade_name?: string | null;
  cnpj: string;
  // Estado de registro — a SEFAZ seleciona o webservice de NF-e por UF, não
  // só por ambiente. Nullable: empresas cadastradas antes desse campo
  // existir não têm valor, e nesse caso não são elegíveis pra distribuição
  // automática (o nfe-gateway não tem pra onde rotear a chamada).
  uf?: string | null;
  environment: 'production' | 'homologation' | string;
  status: 'active' | 'suspended' | 'disabled' | string;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface ApiCertificate {
  id: string;
  organization_id: string;
  organization_company_id: string;
  type: string;
  key_vault_certificate_name: string;
  thumbprint: string;
  subject_cn?: string | null;
  issuer_cn?: string | null;
  serial_number?: string | null;
  not_before: string;
  not_after: string;
  status: 'active' | 'replaced' | 'revoked' | 'expired' | string;
  uploaded_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ApiCompanyService {
  service_id: string;
  service_code: string;
  service_name: string;
  status: 'active' | 'disabled' | string;
  activated_at?: string | null;
  deactivated_at?: string | null;
}

// Governança da consulta de distribuição por NSU (nfe-gateway) — estado
// atual do cursor + o log de tentativas, exposto em GET .../nfe_distribution.
// Só leitura: quem escreve essas tabelas é o serviço Python, nunca o backend.
export interface ApiNfeDistributionState {
  organization_company_id: string;
  status: 'active' | 'paused' | 'error' | string;
  last_nsu: number;
  max_nsu: number;
  poll_interval_seconds: number;
  consecutive_empty_polls: number;
  consecutive_errors: number;
  last_cstat?: string | null;
  last_message?: string | null;
  last_poll_at?: string | null;
  last_success_at?: string | null;
  next_allowed_poll_at: string;
}

export interface ApiNfeDistributionPoll {
  id: string;
  organization_company_id: string;
  requested_nsu: number;
  ult_nsu?: number | null;
  max_nsu?: number | null;
  cstat?: string | null;
  xmotivo?: string | null;
  documents_found: number;
  documents_ingested: number;
  documents_summary_only: number;
  outcome: 'has_more' | 'no_content' | 'rate_limited' | 'error' | string;
  error_message?: string | null;
  started_at: string;
  finished_at: string;
}

export interface ApiNfeDistributionStatus {
  state: ApiNfeDistributionState | null;
  polls: ApiNfeDistributionPoll[];
}

export interface ApiIntegrationConfiguration {
  client_id?: string;
  token_url?: string;
  sap_client?: string;
  sap_language?: string;
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
}

export interface ApiIntegration {
  id: string;
  organization_id: string;
  organization_company_id?: string | null;
  name: string;
  integration_type: string;
  environment: string;
  base_url?: string | null;
  status: 'active' | 'disabled' | 'error' | string;
  has_secret: boolean;
  configuration_json: ApiIntegrationConfiguration;
  created_at: string;
  updated_at: string;
}

export interface ApiAPIClient {
  id: string;
  organization_id: string;
  name: string;
  client_id: string;
  source_system: string;
  status: 'active' | 'suspended' | 'revoked' | string;
  has_legacy_org_token: boolean;
  token_hint?: string | null;
  secret_hint?: string | null;
  scopes: string[];
  last_used_at?: string | null;
  request_count: number;
  created_at: string;
}

export interface CreatedApiClient {
  client: ApiAPIClient;
  client_secret: string;
  org_token?: string;
}

export interface RotatedInboundToken {
  org_token: string;
  token_hint: string;
  has_legacy_org_token: boolean;
}

export interface ApiFiscalDocument {
  id: string;
  organization_id: string;
  organization_company_id: string;
  document_type: 'nfe' | 'nfse' | string;
  direction: string;
  environment: string;
  external_id?: string | null;
  source_system: string;
  source_document_id?: string | null;
  idempotency_key: string;
  document_key?: string | null;
  status: string;
  processing_status: string;
  current_version: number;
  correlation_id: string;
  trace_id: string;
  received_at: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  // NF-e header, joined in from organization_nfe — absent for document_type nfse.
  access_key?: string | null;
  series?: string | null;
  number?: string | null;
  issuer_cnpj?: string | null;
  recipient_document?: string | null;
  issued_at?: string | null;
  issuer_name?: string | null;
  nfe?: ApiNFeDetails | null;
}

export interface ApiNFeAddress {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city_code?: string;
  city?: string;
  uf?: string;
  cep?: string;
  phone?: string;
}

export interface ApiNFeParty {
  cnpj?: string;
  cpf?: string;
  legal_name?: string;
  trade_name?: string;
  ie?: string;
  im?: string;
  crt?: string;
  address?: ApiNFeAddress | null;
}

export interface ApiNFeTotals {
  products: number;
  freight: number;
  insurance: number;
  discount: number;
  other: number;
  nf: number;
  icms_base: number;
  icms: number;
  icms_st: number;
  fcp: number;
  ipi: number;
  pis: number;
  cofins: number;
  ii: number;
}

export interface ApiNFeDetails {
  issuer: ApiNFeParty;
  recipient: ApiNFeParty;
  nature_of_operation?: string;
  operation_type?: string;
  finality?: string;
  totals?: ApiNFeTotals | null;
}

export interface ApiItemTax {
  cst?: string;
  csosn?: string;
  base?: number;
  rate?: number;
  amount?: number;
}

export interface ApiItemTaxes {
  icms?: ApiItemTax | null;
  ipi?: ApiItemTax | null;
  pis?: ApiItemTax | null;
  cofins?: ApiItemTax | null;
}

// resNFe/resEvento/procEventoNFe summary found by the nfe-gateway during
// NSU/chave distribution but not yet ingestible as a full document — see
// backend migration 019 and nfe-gateway/src/nfe_gateway/sefaz/distribution.py's
// parse_pending_summary. 'manifesting'/'manifested' only appear once a
// Ciência da Operação has been requested via requestFiscalDocumentManifestation.
export type PendingFiscalDocumentStatus = 'pending' | 'manifesting' | 'manifested' | 'error';

export interface ApiPendingFiscalDocument {
  id: string;
  organization_id: string;
  organization_company_id: string;
  chave: string;
  nsu: number;
  schema: string;
  cnpj_emitente?: string | null;
  nome_emitente?: string | null;
  valor?: number | null;
  data_emissao?: string | null;
  protocolo?: string | null;
  situacao?: string | null;
  status: PendingFiscalDocumentStatus;
  error_message?: string | null;
  created_at: string;
  manifested_at?: string | null;
}

export type FiscalQueryType = 'nsu' | 'chave' | 'batch';
export type FiscalQueryStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type FiscalQueryItemStatus = 'pending' | 'found' | 'not_found' | 'error';

export interface ApiFiscalDocumentQuery {
  id: string;
  organization_id: string;
  organization_company_id: string;
  requested_by_user_id: string;
  query_type: FiscalQueryType;
  params_json: unknown;
  status: FiscalQueryStatus;
  result_summary_json?: unknown;
  created_at: string;
  completed_at?: string | null;
  already_queued?: boolean;
}

export interface ApiFiscalDocumentQueryItem {
  id: string;
  query_request_id: string;
  chave: string;
  status: FiscalQueryItemStatus;
  document_id?: string | null;
  error_message?: string | null;
  resolved_at?: string | null;
}

export interface ApiFiscalDocumentQueryDetail extends ApiFiscalDocumentQuery {
  items?: ApiFiscalDocumentQueryItem[];
}

export interface ApiNotification {
  id: string;
  user_id: string;
  organization_id?: string | null;
  type: string;
  title: string;
  body: string;
  data?: unknown;
  read_at?: string | null;
  created_at: string;
}

export interface ApiDocumentEvent {
  id: string;
  organization_id: string;
  organization_document_id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  actor_type: string;
  actor_id?: string | null;
  metadata_json: unknown;
  occurred_at: string;
}

// --- Fiscal inbound orchestrator (backend/internal/inbound) ---
// Mirrors backend/internal/inbound/model.go 1:1 — see
// docs/architecture/21_fiscal_inbound_orchestrator.md for the design.

export type StepMode = 'DISABLED' | 'AUTO' | 'MANUAL' | 'CONDITIONAL';
export type FailureAction = 'PASS' | 'WARN' | 'BLOCK' | 'WAIT_USER' | 'REJECT';

export interface ApiInboundScenario {
  id: string;
  organization_id: string;
  organization_company_id: string;
  document_model?: string | null;
  purchase_order_type?: string | null;
  cfop?: string | null;
  vendor_cnpj?: string | null;
  plant?: string | null;
  purchasing_organization?: string | null;
  process_template_code: string;
  is_active: boolean;
  valid_from: string;
  valid_until?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiInboundScenarioRule {
  scenario_id: string;
  po_reference_policy: string;
  po_reference_level: string;
  po_missing_action: string;
  po_resolution_mode: string;
  po_not_found_action: string;

  validate_vendor: boolean;
  vendor_failure_action: FailureAction | string;
  vendor_override_allowed: boolean;

  validate_material: boolean;
  material_failure_action: FailureAction | string;
  material_override_allowed: boolean;

  validate_quantity: boolean;
  quantity_tolerance_percent: number;

  validate_price: boolean;
  price_tolerance_percent: number;

  validate_tax: boolean;
  tax_failure_action: FailureAction | string;

  receipt_mode: string;
  inbound_delivery_mode: StepMode | string;
  goods_receipt_mode: StepMode | string;
  goods_receipt_movement_type: string;
  supplier_invoice_mode: StepMode | string;

  notify_on_reject: boolean;
  create_occurrence_on_reject: boolean;
  notify_vendor_on_reject: boolean;
  sefaz_event_on_reject: boolean;

  responsible_emails: string[];

  configuration_json?: unknown;
  created_at: string;
  updated_at: string;
}

export interface ApiInboundScenarioWithRule {
  scenario: ApiInboundScenario;
  rule: ApiInboundScenarioRule;
}

export interface ApiInboundItem {
  id: string;
  organization_id: string;
  organization_document_id: string;
  item_number: number;
  supplier_material_code?: string | null;
  description?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  total_amount: number;
  purchase_order_reference_raw?: string | null;
  purchase_order_item_reference_raw?: string | null;
  resolved_material_code?: string | null;
  resolved_purchase_order_number?: string | null;
  resolved_purchase_order_item?: string | null;
  taxes?: ApiItemTaxes | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApiInboundMatch {
  id: string;
  organization_id: string;
  organization_document_id: string;
  organization_nfe_item_id?: string | null;
  match_type: string;
  source_value?: string | null;
  resolved_value?: string | null;
  strategy?: string | null;
  confidence?: number | null;
  status: string;
  created_at: string;
}

export interface ApiInboundValidation {
  id: string;
  organization_id: string;
  organization_document_id: string;
  organization_nfe_item_id?: string | null;
  validation_type: string;
  status: string;
  severity: string;
  expected_value?: string | null;
  actual_value?: string | null;
  message?: string | null;
  organization_inbound_scenario_id?: string | null;
  created_at: string;
}

export interface ApiInboundOverride {
  id: string;
  organization_id: string;
  organization_document_id: string;
  organization_nfe_item_id?: string | null;
  override_type: string;
  original_value?: string | null;
  override_value: string;
  reason: string;
  created_by_user_id: string;
  approved_by_user_id?: string | null;
  created_at: string;
}

export interface ApiVendorMaterialMapping {
  id: string;
  organization_id: string;
  organization_company_id?: string | null;
  vendor_cnpj: string;
  supplier_material_code: string;
  resolved_material_code: string;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiExecutionPlan {
  id: string;
  organization_id: string;
  organization_document_id: string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApiPlanStep {
  id: string;
  organization_id: string;
  execution_plan_id: string;
  organization_document_id: string;
  sequence: number;
  step_type: string;
  mode: 'AUTO' | 'MANUAL';
  status: string;
  dependency_step_id?: string | null;
  idempotency_key: string;
  request_payload_json?: unknown;
  response_payload_json?: unknown;
  sap_document_number?: string | null;
  error_code?: string | null;
  error_message_sanitized?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiOrchestrationView {
  document_id: string;
  scenario?: ApiInboundScenarioWithRule | null;
  items: ApiInboundItem[];
  matches: ApiInboundMatch[];
  validations: ApiInboundValidation[];
  overrides: ApiInboundOverride[];
  plan?: ApiExecutionPlan | null;
  steps?: ApiPlanStep[];
}

export interface ApiPurchaseOrderItem {
  item_number: string;
  material_code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  plant?: string;
}

export interface ApiPurchaseOrder {
  number: string;
  vendor_code: string;
  items: ApiPurchaseOrderItem[];
}

export interface ApiInvitation {
  id: string;
  user_id: string;
  organization_id?: string | null;
  email: string;
  expires_at: string;
  created_at: string;
}

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: string;
  user?: ApiUser;
  organization_id?: string | null;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  challenge_token?: string;
}

export interface ApiPasswordPolicy {
  min_length: number;
  max_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number: boolean;
  require_special: boolean;
}

export interface ApiAuthSettings {
  organization_id: string;
  min_password_length: number;
  max_password_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number: boolean;
  require_special: boolean;
  mfa_required: boolean;
  access_locked: boolean;
  access_lock_message?: string | null;
  access_locked_at?: string | null;
  access_locked_by_user_id?: string | null;
  session_idle_timeout_minutes: number;
  session_absolute_timeout_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ApiSession {
  id: string;
  user_id: string;
  device_label?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
  expires_at: string;
  last_seen_at: string;
  revoked_at?: string | null;
  created_at: string;
  current: boolean;
}

export interface ApiSecurityEvent {
  id: string;
  event_type: string;
  outcome: string;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata_json?: unknown;
  occurred_at: string;
}

export interface ApiAuditEvent {
  id: string;
  organization_id?: string | null;
  actor_type: string;
  actor_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  reason?: string | null;
  after?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
  occurred_at: string;
}

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  trace_id: string;
}
