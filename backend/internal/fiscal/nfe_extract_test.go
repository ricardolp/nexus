package fiscal

import "testing"

func TestExtractNFeFromPayload(t *testing.T) {
	t.Parallel()

	t.Run("sap_json_fields", func(t *testing.T) {
		t.Parallel()
		payload := []byte(`{"serie":"1","numero":"000339577","cnpj_emitente":"48344725000808"}`)
		got := extractNFeFromPayload(payload)
		if got.Series != "1" || got.Number != "000339577" || got.IssuerCNPJ != "48344725000808" {
			t.Fatalf("unexpected extraction: %#v", got)
		}
	})

	t.Run("non_json_payload_is_noop", func(t *testing.T) {
		t.Parallel()
		got := extractNFeFromPayload([]byte(`not json`))
		if got.Series != "" || got.Number != "" || got.IssuerCNPJ != "" {
			t.Fatalf("expected zero value, got %#v", got)
		}
	})

	t.Run("missing_keys_are_noop", func(t *testing.T) {
		t.Parallel()
		got := extractNFeFromPayload([]byte(`{"outro_campo":"x"}`))
		if got.Series != "" || got.Number != "" || got.IssuerCNPJ != "" {
			t.Fatalf("expected zero value, got %#v", got)
		}
	})
}

func TestMergeNFe(t *testing.T) {
	t.Parallel()

	t.Run("explicit_wins_over_parsed", func(t *testing.T) {
		t.Parallel()
		explicit := &NFeExtension{Series: "2", AccessKey: "explicit-key"}
		parsed := NFeExtension{Series: "1", Number: "000339577", IssuerCNPJ: "48344725000808"}
		got := mergeNFe(explicit, parsed)
		if got.Series != "2" || got.AccessKey != "explicit-key" {
			t.Fatalf("explicit fields were overwritten: %#v", got)
		}
		if got.Number != "000339577" || got.IssuerCNPJ != "48344725000808" {
			t.Fatalf("parsed fields did not fill gaps: %#v", got)
		}
	})

	t.Run("nil_explicit_uses_parsed", func(t *testing.T) {
		t.Parallel()
		parsed := NFeExtension{Series: "1", Number: "000339577", IssuerCNPJ: "48344725000808"}
		got := mergeNFe(nil, parsed)
		if got.Series != "1" || got.Number != "000339577" || got.IssuerCNPJ != "48344725000808" {
			t.Fatalf("unexpected merge result: %#v", got)
		}
	})
}
