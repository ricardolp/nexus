package cnpja_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/cnpja"
)

func TestLookupOffice_MapsFields(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/office/07526557011659" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"taxId":"07526557011659",
			"alias":"Filial",
			"company":{"name":"AMBEV S.A."},
			"status":{"text":"Ativa"},
			"address":{
				"municipality":1302603,
				"street":"Avenida Constantino Nery",
				"number":"2575",
				"district":"Flores",
				"city":"Manaus",
				"state":"AM",
				"zip":"69058795"
			},
			"phones":[{"area":"19","number":"33135680"}],
			"emails":[{"address":"opobrigaces@ambev.com.br"}],
			"mainActivity":{"id":1113502,"text":"Fabricação de cervejas e chopes"},
			"sideActivities":[{"id":4635401,"text":"Comércio atacadista de cerveja, chope e refrigerante"}]
		}`))
	}))
	t.Cleanup(srv.Close)

	c := cnpja.NewClientForTest(srv.URL)
	got, err := c.LookupOffice(context.Background(), "07.526.557/0116-59")
	if err != nil {
		t.Fatal(err)
	}
	if got.LegalName != "AMBEV S.A." {
		t.Fatalf("legal_name=%q", got.LegalName)
	}
	if got.MunicipalityCode == nil || *got.MunicipalityCode != "1302603" {
		t.Fatalf("municipality=%v", got.MunicipalityCode)
	}
	if got.UF == nil || *got.UF != "AM" {
		t.Fatalf("uf=%v", got.UF)
	}
	if got.Phone == nil || *got.Phone != "1933135680" {
		t.Fatalf("phone=%v", got.Phone)
	}
	if got.Email == nil || *got.Email != "opobrigaces@ambev.com.br" {
		t.Fatalf("email=%v", got.Email)
	}
	if got.MainActivity == nil || got.MainActivity.Code != "1113502" {
		t.Fatalf("main_activity=%v", got.MainActivity)
	}
	if len(got.SideActivities) != 1 || got.SideActivities[0].Code != "4635401" {
		t.Fatalf("side=%v", got.SideActivities)
	}
}

func TestLookupOffice_InvalidCNPJ(t *testing.T) {
	t.Parallel()
	c := cnpja.NewClient()
	if _, err := c.LookupOffice(context.Background(), "123"); err == nil {
		t.Fatal("expected validation error")
	}
}
