package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// Seed data for the LS Mtron Brasil homologation tenant. These are fixed
// (not env-configurable) because this seed targets one specific tenant.
const (
	platformStaffEmail = "admin@nexus.app"

	tenantAdminEmail = "ricardo.pinheiro@novaconsulting.com.br"

	tenantLegalName = "LS MTRON INDUSTRIA DE MAQUINAS AGRICOLAS LTDA"
	tenantTradeName = "LS Mtron Brasil"
	tenantSlug      = "ls-mtron-brasil"
	tenantCNPJ      = "13677964000200"
	tenantEnv       = "homologation"
	tenantLogoURL   = "/logos/ls-mtron.jpg"
)

// tenantUF is the one exception to "fixed, not env-configurable" above: it's
// the company's real state of registration with SEFAZ, which this codebase
// has no way to look up or safely guess — get it wrong and every nfe-gateway
// distribution/authorization call routes to the wrong webservice. Optional
// (SEED_TENANT_UF) so the seed still runs without it; ensureCompany leaves
// uf unset when empty rather than defaulting to something plausible-looking
// but potentially wrong.
var tenantUF = os.Getenv("SEED_TENANT_UF")

func main() {
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	tiPassword := os.Getenv("SEED_TI_PASSWORD")
	tenantAdminPassword := os.Getenv("SEED_TENANT_ADMIN_PASSWORD")
	if databaseURL == "" || tiPassword == "" || tenantAdminPassword == "" {
		log.Fatal("DATABASE_URL, SEED_TI_PASSWORD and SEED_TENANT_ADMIN_PASSWORD are required")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, databaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	identitySvc := identity.NewService(pool)
	orgSvc := organization.NewService(pool)

	tiUser, err := ensureUser(ctx, identitySvc, platformStaffEmail, identity.PlatformRoleAdmin, tiPassword)
	if err != nil {
		log.Fatalf("platform staff user: %v", err)
	}
	fmt.Printf("platform staff user: %s (%s)\n", tiUser.Email, tiUser.ID)

	tenantAdmin, err := ensureUser(ctx, identitySvc, tenantAdminEmail, identity.PlatformRoleMember, tenantAdminPassword)
	if err != nil {
		log.Fatalf("tenant admin user: %v", err)
	}
	fmt.Printf("tenant admin user: %s (%s)\n", tenantAdmin.Email, tenantAdmin.ID)

	org, err := ensureOrganization(ctx, pool, orgSvc, tenantAdmin.ID)
	if err != nil {
		log.Fatalf("tenant: %v", err)
	}
	fmt.Printf("tenant: %s (%s)\n", org.LegalName, org.ID)

	if err := ensureOwnerMembership(ctx, pool, orgSvc, org.ID, tenantAdmin.ID); err != nil {
		log.Fatalf("tenant admin membership: %v", err)
	}

	company, err := ensureCompany(ctx, pool, orgSvc, org.ID, tenantAdmin.ID)
	if err != nil {
		log.Fatalf("company: %v", err)
	}
	fmt.Printf("company: %s CNPJ %s (%s, %s)\n", company.LegalName, company.CNPJ, company.ID, company.Environment)

	inboundSvc := inbound.NewService(pool, nil, orgSvc, nil)
	if err := ensureDefaultInboundScenario(ctx, pool, inboundSvc, org.ID, company.ID, tenantAdmin.ID); err != nil {
		log.Fatalf("inbound scenario: %v", err)
	}

	// Fix the initial passwords last, regardless of whether the users above
	// were freshly created or already existed — makes the seed safe to
	// re-run while still guaranteeing known credentials at the end.
	if err := fixPassword(ctx, pool, tiUser.ID, tiPassword); err != nil {
		log.Fatalf("fix platform staff password: %v", err)
	}
	if err := fixPassword(ctx, pool, tenantAdmin.ID, tenantAdminPassword); err != nil {
		log.Fatalf("fix tenant admin password: %v", err)
	}

	fmt.Println("\nseed complete. initial credentials:")
	fmt.Printf("  %s\n", tiUser.Email)
	fmt.Printf("  %s\n", tenantAdmin.Email)
}

func ensureUser(ctx context.Context, svc *identity.Service, email, platformRole, password string) (*identity.User, error) {
	existing, err := svc.GetByEmail(ctx, email)
	if err == nil {
		return existing, nil
	}
	var domErr *domainerr.Error
	if !errors.As(err, &domErr) || domErr.Code != "user_not_found" {
		return nil, err
	}

	return svc.Register(ctx, identity.RegisterInput{
		Email:        email,
		Password:     password,
		PlatformRole: platformRole,
	})
}

func ensureOrganization(ctx context.Context, pool *db.Pool, svc *organization.Service, ownerUserID uuid.UUID) (*organization.Organization, error) {
	var existingID uuid.UUID
	// Prefer the oldest tenant that already represents this company so a
	// second slug (e.g. ls-mtron-brasil vs ls-mtron) is not created on
	// environments that were seeded or registered before this binary.
	err := pool.QueryRow(ctx, `
		select id from organizations
		where slug in ($1, 'ls-mtron')
		   or tax_identifier = $2
		order by created_at, id
		limit 1
	`, tenantSlug, tenantCNPJ).Scan(&existingID)
	if err == nil {
		if err := applyTenantLogo(ctx, pool, existingID); err != nil {
			return nil, err
		}
		return svc.GetOrganization(ctx, existingID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	org, err := svc.CreateOrganization(ctx, organization.CreateOrganizationInput{
		LegalName:     tenantLegalName,
		TradeName:     tenantTradeName,
		Slug:          tenantSlug,
		TaxIdentifier: tenantCNPJ,
		OwnerUserID:   ownerUserID,
	})
	if err != nil {
		return nil, err
	}
	if err := applyTenantLogo(ctx, pool, org.ID); err != nil {
		return nil, err
	}
	logo := tenantLogoURL
	org.LogoURL = &logo
	return org, nil
}

func applyTenantLogo(ctx context.Context, pool *db.Pool, organizationID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		update organizations set logo_url = $2, updated_at = now()
		where id = $1 and (logo_url is distinct from $2)
	`, organizationID, tenantLogoURL)
	return err
}

// ensureOwnerMembership guarantees the tenant admin is an active member of
// the organization holding the system "Administrador" role. CreateOrganization
// already does this for a freshly created tenant; this only matters when the
// seed is re-run against an already-existing organization.
func ensureOwnerMembership(ctx context.Context, pool *db.Pool, svc *organization.Service, organizationID, userID uuid.UUID) error {
	var memberID uuid.UUID
	err := pool.QueryRow(ctx, `
		select id from organization_members where organization_id = $1 and user_id = $2
	`, organizationID, userID).Scan(&memberID)
	if errors.Is(err, pgx.ErrNoRows) {
		member, addErr := svc.AddExistingMember(ctx, organization.AddMemberInput{
			OrganizationID: organizationID,
			Email:          tenantAdminEmail,
			ActorUserID:    userID,
		})
		if addErr != nil {
			return addErr
		}
		memberID = member.ID
	} else if err != nil {
		return err
	}

	var roleID uuid.UUID
	if err := pool.QueryRow(ctx, `
		select id from organization_roles where organization_id = $1 and slug = 'administrador'
	`, organizationID).Scan(&roleID); err != nil {
		return err
	}

	var hasRole bool
	if err := pool.QueryRow(ctx, `
		select exists(
			select 1 from organization_member_roles
			where organization_member_id = $1 and organization_role_id = $2 and organization_company_id is null
		)
	`, memberID, roleID).Scan(&hasRole); err != nil {
		return err
	}
	if hasRole {
		return nil
	}

	_, err = pool.Exec(ctx, `
		insert into organization_member_roles (id, organization_id, organization_member_id, organization_role_id, valid_from, created_at)
		values ($1,$2,$3,$4,now(),now())
	`, ids.New(), organizationID, memberID, roleID)
	return err
}

func ensureCompany(ctx context.Context, pool *db.Pool, svc *organization.Service, organizationID, actorUserID uuid.UUID) (*organization.Company, error) {
	var existingID uuid.UUID
	err := pool.QueryRow(ctx, `
		select id from organization_companies where organization_id = $1 and cnpj = $2
	`, organizationID, tenantCNPJ).Scan(&existingID)
	if err == nil {
		return svc.GetCompany(ctx, organizationID, existingID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	return svc.CreateCompany(ctx, organization.CreateCompanyInput{
		OrganizationID: organizationID,
		LegalName:      tenantLegalName,
		TradeName:      tenantTradeName,
		CNPJ:           tenantCNPJ,
		UF:             tenantUF,
		Environment:    tenantEnv,
		ActorUserID:    actorUserID,
	})
}

// ensureDefaultInboundScenario creates one catch-all STANDARD_PURCHASE flow
// for the tenant company when none exists. Matching treats nil model/CFOP/
// vendor as wildcards, so a single row unblocks inbound NF-e (the seed used
// to create the company but left Fluxos de processo empty, which surfaced as
// scenario_not_found with no SAP call).
func ensureDefaultInboundScenario(ctx context.Context, pool *db.Pool, inboundSvc *inbound.Service, organizationID, companyID, actorUserID uuid.UUID) error {
	var n int
	err := pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			select count(*)
			from organization_inbound_scenarios
			where organization_id = $1 and organization_company_id = $2 and is_active
		`, organizationID, companyID).Scan(&n)
	})
	if err != nil {
		return err
	}
	if n > 0 {
		fmt.Printf("inbound scenario: %d already active for company, skipping\n", n)
		return nil
	}

	created, err := inboundSvc.CreateScenario(ctx, inbound.CreateScenarioInput{
		OrganizationID:        organizationID,
		OrganizationCompanyID: companyID,
		ProcessTemplateCode:   inbound.TemplateStandardPurchase,
		Rule: inbound.ScenarioRuleInput{
			POReferencePolicy:        inbound.POReferencePolicyRequired,
			POReferenceLevel:         inbound.POReferenceLevelDocumentOrItem,
			POMissingAction:          inbound.POMissingActionWaitUser,
			POResolutionMode:         inbound.POResolutionFindExisting,
			PONotFoundAction:         inbound.PONotFoundWaitUser,
			ValidateVendor:           true,
			VendorFailureAction:      inbound.FailureActionWaitUser,
			VendorOverrideAllowed:    true,
			ValidateMaterial:         true,
			MaterialFailureAction:    inbound.FailureActionWaitUser,
			MaterialOverrideAllowed:  true,
			ValidateQuantity:         true,
			QuantityTolerancePercent: 5,
			ValidatePrice:            true,
			PriceTolerancePercent:    5,
			ValidateTax:              false,
			TaxFailureAction:         inbound.FailureActionPass,
			ReceiptMode:              inbound.ReceiptModeInboundDelivery,
			InboundDeliveryMode:      inbound.StepConfigAuto,
			GoodsReceiptMode:         inbound.StepConfigAuto,
			GoodsReceiptMovementType: "101",
			SupplierInvoiceMode:      inbound.StepConfigAuto,
		},
		ActorUserID: actorUserID,
	})
	if err != nil {
		return err
	}
	fmt.Printf("inbound scenario: catch-all STANDARD_PURCHASE created (%s)\n", created.Scenario.ID)
	return nil
}

func fixPassword(ctx context.Context, pool *db.Pool, userID uuid.UUID, password string) error {
	if err := identity.ValidatePassword(password); err != nil {
		return err
	}
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `
		update users
		set password_hash = $2, password_changed_at = now(), status = 'active', updated_at = now()
		where id = $1
	`, userID, hash)
	return err
}
