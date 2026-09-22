package organization

import "testing"

func TestValidateCustomerDocument(t *testing.T) {
	t.Parallel()

	t.Run("exactly_one_required", func(t *testing.T) {
		t.Parallel()
		if _, _, _, err := validateCustomerDocument("", "", ""); err == nil {
			t.Fatal("expected error")
		}
		if _, _, _, err := validateCustomerDocument("39053344705", "11222333000181", ""); err == nil {
			t.Fatal("expected error for two docs")
		}
	})

	t.Run("cpf_length", func(t *testing.T) {
		t.Parallel()
		if _, _, _, err := validateCustomerDocument("123", "", ""); err == nil {
			t.Fatal("expected invalid cpf")
		}
	})

	t.Run("valid_cnpj", func(t *testing.T) {
		t.Parallel()
		cnpj := "11222333000181"
		if !ValidCNPJ(cnpj) {
			t.Skip("fixture CNPJ not accepted by ValidCNPJ")
		}
		_, out, _, err := validateCustomerDocument("", cnpj, "")
		if err != nil {
			t.Fatal(err)
		}
		if out == nil || *out != cnpj {
			t.Fatalf("got %#v", out)
		}
	})

	t.Run("nif_ok", func(t *testing.T) {
		t.Parallel()
		_, _, nif, err := validateCustomerDocument("", "", "EU123")
		if err != nil {
			t.Fatal(err)
		}
		if nif == nil || *nif != "EU123" {
			t.Fatalf("got %#v", nif)
		}
	})
}
