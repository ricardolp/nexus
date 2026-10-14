package organization

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
)

// Integração com Postgres (migrations aplicadas). Roda só com TEST_DATABASE_URL.
func TestNFSeIBSCBSDefaultsPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip()
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	orgID, compID := uuid.New(), uuid.New()
	ex := func(sql string, a ...any) {
		if _, err := pool.Exec(ctx, sql, a...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	ex(`insert into organizations (id, legal_name, slug, status) values ($1,'Org','o-'||$2,'active')`, orgID, orgID.String()[:8])
	ex(`insert into organization_companies (id, organization_id, legal_name, cnpj, environment, status) values ($1,$2,'Cia','12345678000195','homologation','active')`, compID, orgID)
	ex(`insert into organization_company_cnaes (id, organization_id, organization_company_id, cnae_code) values ($1,$2,$3,'6201501')`, uuid.New(), orgID, compID)
	s := NewService(pool)
	sp := func(v string) *string { return &v }
	created, err := s.CreateCompanyNFSeService(ctx, UpsertCompanyNFSeServiceInput{
		OrganizationID: orgID, CompanyID: compID, CNAECode: "6201501", ServiceDescription: "Dev",
		ServiceListItem: "01.01", NBSCode: "1.1502.10.00",
		IBSCBSCST: sp("000"), IBSCBSClassTrib: sp("000001"), IBSCBSOperationIndicator: sp("100301"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.IBSCBSCST == nil || *created.IBSCBSCST != "000" || *created.IBSCBSOperationIndicator != "100301" {
		t.Fatalf("create: %+v", created)
	}
	// Update without the new fields (old UI) must keep them.
	upd, err := s.UpdateCompanyNFSeService(ctx, UpsertCompanyNFSeServiceInput{
		OrganizationID: orgID, CompanyID: compID, ServiceID: created.ID, CNAECode: "6201501",
		ServiceDescription: "Dev 2", ServiceListItem: "01.01", NBSCode: "1.1502.10.00", IsFavorite: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if upd.IBSCBSCST == nil || *upd.IBSCBSClassTrib != "000001" || *upd.IBSCBSOperationIndicator != "100301" {
		t.Fatalf("update wiped defaults: %+v", upd)
	}
	// Explicit empty clears only the indicator.
	upd, err = s.UpdateCompanyNFSeService(ctx, UpsertCompanyNFSeServiceInput{
		OrganizationID: orgID, CompanyID: compID, ServiceID: created.ID, CNAECode: "6201501",
		ServiceDescription: "Dev 2", ServiceListItem: "01.01", NBSCode: "1.1502.10.00", IBSCBSOperationIndicator: sp(""),
	})
	if err != nil {
		t.Fatal(err)
	}
	if upd.IBSCBSOperationIndicator != nil || upd.IBSCBSCST == nil {
		t.Fatalf("clear: %+v", upd)
	}
}
