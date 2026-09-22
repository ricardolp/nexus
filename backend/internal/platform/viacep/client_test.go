package viacep_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/viacep"
)

func TestLookup_MapsFields(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ws/01001000/json/" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"cep":"01001-000",
			"logradouro":"Praça da Sé",
			"complemento":"lado ímpar",
			"bairro":"Sé",
			"localidade":"São Paulo",
			"uf":"SP",
			"ibge":"3550308"
		}`))
	}))
	t.Cleanup(srv.Close)

	got, err := viacep.NewClientForTest(srv.URL).Lookup(context.Background(), "01001-000")
	if err != nil {
		t.Fatal(err)
	}
	if got.Street != "Praça da Sé" || got.UF != "SP" || got.MunicipalityCode != "3550308" {
		t.Fatalf("%+v", got)
	}
}

func TestLookup_NotFound(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"erro":true}`))
	}))
	t.Cleanup(srv.Close)
	if _, err := viacep.NewClientForTest(srv.URL).Lookup(context.Background(), "99999999"); err == nil {
		t.Fatal("expected not found")
	}
}
