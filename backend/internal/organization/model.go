package organization

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Organization struct {
	ID            uuid.UUID `json:"id"`
	LegalName     string    `json:"legal_name"`
	TradeName     *string   `json:"trade_name,omitempty"`
	Slug          string    `json:"slug"`
	TaxIdentifier *string   `json:"tax_identifier,omitempty"`
	LogoURL       *string   `json:"logo_url,omitempty"`
	Status        string    `json:"status"`
	Timezone      string    `json:"timezone"`
	DefaultLocale string    `json:"default_locale"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Company struct {
	ID             uuid.UUID `json:"id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	LegalName      string    `json:"legal_name"`
	TradeName      *string   `json:"trade_name,omitempty"`
	CNPJ           string    `json:"cnpj"`
	// UF is the company's state of registration — required to route to the
	// right SEFAZ webservice for NF-e (distribution and authorization both
	// select their endpoint by UF, not just by environment). Nullable
	// because existing companies predate this field; nfe-gateway can't do
	// anything real for a company without it set.
	UF           *string         `json:"uf,omitempty"`
	Environment  string          `json:"environment"`
	Status       string          `json:"status"`
	MetadataJSON json.RawMessage `json:"metadata_json"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// CompanyService is a row in the service catalog joined with its activation
// state for a specific company — status is "disabled" both when explicitly
// deactivated and when the company has never activated that service.
type CompanyService struct {
	ServiceID     uuid.UUID  `json:"service_id"`
	ServiceCode   string     `json:"service_code"`
	ServiceName   string     `json:"service_name"`
	Status        string     `json:"status"`
	ActivatedAt   *time.Time `json:"activated_at,omitempty"`
	DeactivatedAt *time.Time `json:"deactivated_at,omitempty"`
}

type Member struct {
	ID             uuid.UUID  `json:"id"`
	OrganizationID uuid.UUID  `json:"organization_id"`
	UserID         uuid.UUID  `json:"user_id"`
	Status         string     `json:"status"`
	JoinedAt       *time.Time `json:"joined_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// MemberWithUser joins organization_members with the user's identity fields
// for member-listing endpoints (avoids the caller needing a second round
// trip to the identity service for every row).
type MemberWithUser struct {
	ID                  uuid.UUID  `json:"id"`
	UserID              uuid.UUID  `json:"user_id"`
	Email               string     `json:"email"`
	PlatformRole        string     `json:"platform_role"`
	Status              string     `json:"status"`
	JoinedAt            *time.Time `json:"joined_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	InvitationExpiresAt *time.Time `json:"invitation_expires_at,omitempty"`
	LastLoginAt         *time.Time `json:"last_login_at,omitempty"`
}

// OrganizationUsage is a per-tenant usage rollup for the platform admin panel.
type OrganizationUsage struct {
	OrganizationID             uuid.UUID `json:"organization_id"`
	LegalName                  string    `json:"legal_name"`
	Slug                       string    `json:"slug"`
	Status                     string    `json:"status"`
	CompaniesCount             int64     `json:"companies_count"`
	MembersCount               int64     `json:"members_count"`
	DocumentsCount             int64     `json:"documents_count"`
	DocumentsLast24h           int64     `json:"documents_last_24h"`
	ErrorsLast24h              int64     `json:"errors_last_24h"`
	DistributionErrorCompanies int64     `json:"distribution_error_companies"`
}

type APIClient struct {
	ID                uuid.UUID  `json:"id"`
	OrganizationID    uuid.UUID  `json:"organization_id"`
	Name              string     `json:"name"`
	ClientID          string     `json:"client_id"`
	SourceSystem      string     `json:"source_system"`
	Status            string     `json:"status"`
	HasLegacyOrgToken bool       `json:"has_legacy_org_token"`
	TokenHint         *string    `json:"token_hint,omitempty"`
	SecretHint        *string    `json:"secret_hint,omitempty"`
	Scopes            []string   `json:"scopes"`
	LastUsedAt        *time.Time `json:"last_used_at,omitempty"`
	RequestCount      int64      `json:"request_count"`
	CreatedAt         time.Time  `json:"created_at"`
}

type CreatedAPIClient struct {
	Client       APIClient `json:"client"`
	ClientSecret string    `json:"client_secret"`
	OrgToken     string    `json:"org_token,omitempty"`
}

type RotatedInboundToken struct {
	OrgToken          string `json:"org_token"`
	TokenHint         string `json:"token_hint"`
	HasLegacyOrgToken bool   `json:"has_legacy_org_token"`
}

type CreateOrganizationInput struct {
	LegalName     string
	TradeName     string
	Slug          string
	TaxIdentifier string
	OwnerUserID   uuid.UUID
}

type UpdateOrganizationInput struct {
	OrganizationID uuid.UUID
	LegalName      string
	TradeName      string
	TaxIdentifier  string
	Timezone       string
	DefaultLocale  string
	ActorUserID    uuid.UUID
}

type AddMemberInput struct {
	OrganizationID uuid.UUID
	Email          string
	ActorUserID    uuid.UUID
}

type UpdateMemberStatusInput struct {
	OrganizationID uuid.UUID
	MemberID       uuid.UUID
	Status         string
	ActorUserID    uuid.UUID
}

type RemoveMemberInput struct {
	OrganizationID uuid.UUID
	MemberID       uuid.UUID
	ActorUserID    uuid.UUID
}

type CreateCompanyInput struct {
	OrganizationID uuid.UUID
	LegalName      string
	TradeName      string
	CNPJ           string
	UF             string
	Environment    string
	ActorUserID    uuid.UUID
}

// UpdateCompanyDetailsInput edits cadastral fields — CNPJ is deliberately
// absent/immutable (correcting it has real fiscal implications; a company
// with the wrong CNPJ should be recreated, not silently patched) and status
// stays on its own dedicated transition (UpdateCompanyStatus/
// UpdateCompanyStatusInput), unaffected by this.
type UpdateCompanyDetailsInput struct {
	OrganizationID uuid.UUID
	CompanyID      uuid.UUID
	LegalName      string
	TradeName      string
	UF             string
	Environment    string
	ActorUserID    uuid.UUID
}

type UpdateCompanyStatusInput struct {
	OrganizationID uuid.UUID
	CompanyID      uuid.UUID
	Status         string
	ActorUserID    uuid.UUID
}

type UpdateCompanyServiceStatusInput struct {
	OrganizationID uuid.UUID
	CompanyID      uuid.UUID
	ServiceID      uuid.UUID
	Status         string
	ActorUserID    uuid.UUID
}

type CreateAPIClientInput struct {
	OrganizationID   uuid.UUID
	Name             string
	SourceSystem     string
	Scopes           []string
	LegacyOrgToken   string
	GenerateOrgToken bool
	ActorUserID      uuid.UUID
}

type RevokeAPIClientInput struct {
	OrganizationID uuid.UUID
	APIClientID    uuid.UUID
	ActorUserID    uuid.UUID
}

type SetLegacyOrgTokenInput struct {
	OrganizationID uuid.UUID
	APIClientID    uuid.UUID
	OrgToken       string
	ActorUserID    uuid.UUID
}

type RotateInboundTokenInput struct {
	OrganizationID uuid.UUID
	APIClientID    uuid.UUID
	ActorUserID    uuid.UUID
}

type AuthenticatedClient struct {
	OrganizationID uuid.UUID
	ClientID       string
	SourceSystem   string
	Scopes         []string
}

type Role struct {
	ID             uuid.UUID `json:"id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Description    *string   `json:"description,omitempty"`
	IsSystem       bool      `json:"is_system"`
	IsDefault      bool      `json:"is_default"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// RoleWithPermissions is the shape returned by every role read/write
// endpoint: a role plus its flattened "resource:action" permission set.
type RoleWithPermissions struct {
	Role
	Permissions []string `json:"permissions"`
}

// MemberRole is a role assignment for an organization member, optionally
// scoped to a single company so e.g. an operator can be limited to specific
// CNPJs within the tenant.
type MemberRole struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationMemberID  uuid.UUID  `json:"organization_member_id"`
	OrganizationRoleID    uuid.UUID  `json:"organization_role_id"`
	RoleName              string     `json:"role_name"`
	RoleSlug              string     `json:"role_slug"`
	OrganizationCompanyID *uuid.UUID `json:"organization_company_id,omitempty"`
	ValidFrom             time.Time  `json:"valid_from"`
	ValidUntil            *time.Time `json:"valid_until,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
}

type CreateRoleInput struct {
	OrganizationID uuid.UUID
	Name           string
	Slug           string
	Description    string
	Permissions    []string
	ActorUserID    uuid.UUID
}

type UpdateRoleInput struct {
	OrganizationID uuid.UUID
	RoleID         uuid.UUID
	Name           string
	Description    string
	Permissions    []string
	ActorUserID    uuid.UUID
}

type DeleteRoleInput struct {
	OrganizationID uuid.UUID
	RoleID         uuid.UUID
	ActorUserID    uuid.UUID
}

type AssignMemberRoleInput struct {
	OrganizationID        uuid.UUID
	MemberID              uuid.UUID
	RoleID                uuid.UUID
	OrganizationCompanyID *uuid.UUID
	ValidUntil            *time.Time
	ActorUserID           uuid.UUID
}

type RemoveMemberRoleInput struct {
	OrganizationID        uuid.UUID
	MemberID              uuid.UUID
	RoleID                uuid.UUID
	OrganizationCompanyID *uuid.UUID
	ActorUserID           uuid.UUID
}

// NFeDistributionState mirrors organization_company_nfe_distribution_state —
// owned/written by the nfe-gateway (Python) service, this backend only ever
// reads it (see docs/architecture/22_nfe_gateway_service.md). max_nsu -
// last_nsu is the remaining catch-up backlog as of the last poll.
type NFeDistributionState struct {
	OrganizationCompanyID uuid.UUID  `json:"organization_company_id"`
	Status                string     `json:"status"`
	LastNSU               int64      `json:"last_nsu"`
	MaxNSU                int64      `json:"max_nsu"`
	PollIntervalSeconds   int        `json:"poll_interval_seconds"`
	ConsecutiveEmptyPolls int        `json:"consecutive_empty_polls"`
	ConsecutiveErrors     int        `json:"consecutive_errors"`
	LastCstat             *string    `json:"last_cstat,omitempty"`
	LastMessage           *string    `json:"last_message,omitempty"`
	LastPollAt            *time.Time `json:"last_poll_at,omitempty"`
	LastSuccessAt         *time.Time `json:"last_success_at,omitempty"`
	NextAllowedPollAt     time.Time  `json:"next_allowed_poll_at"`
}

// NFeDistributionPoll mirrors one row of
// organization_company_nfe_distribution_polls — one row per SEFAZ distribution
// attempt, success or failure, the governance/audit trail an admin browses to
// see exactly what happened and when (see 22_nfe_gateway_service.md).
type NFeDistributionPoll struct {
	ID                    uuid.UUID `json:"id"`
	OrganizationCompanyID uuid.UUID `json:"organization_company_id"`
	RequestedNSU          int64     `json:"requested_nsu"`
	UltNSU                *int64    `json:"ult_nsu,omitempty"`
	MaxNSU                *int64    `json:"max_nsu,omitempty"`
	Cstat                 *string   `json:"cstat,omitempty"`
	Xmotivo               *string   `json:"xmotivo,omitempty"`
	DocumentsFound        int       `json:"documents_found"`
	DocumentsIngested     int       `json:"documents_ingested"`
	DocumentsSummaryOnly  int       `json:"documents_summary_only"`
	Outcome               string    `json:"outcome"`
	ErrorMessage          *string   `json:"error_message,omitempty"`
	StartedAt             time.Time `json:"started_at"`
	FinishedAt            time.Time `json:"finished_at"`
}
