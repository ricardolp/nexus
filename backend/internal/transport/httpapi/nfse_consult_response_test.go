package httpapi

import (
	"encoding/json"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/fiscal"
)

func TestNFSeConsultResponseIncludesAuthorizationFields(t *testing.T) {
	body, err := json.Marshal(nfseConsultResponse{
		Document: fiscal.Document{DocumentType: "nfse", Status: "authorized"},
		consult: fiscal.NFSeConsult{
			AccessKey:         "41069022248401820000111000000000000326094890444784",
			Numero:            "3",
			NumeroRPS:         "1001",
			Serie:             "1",
			CodigoVerificacao: "ABC123",
			Protocol:          "DPS1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatal(err)
	}
	if fields["access_key"] != "41069022248401820000111000000000000326094890444784" {
		t.Fatalf("access_key = %v", fields["access_key"])
	}
	if fields["numero"] != "3" {
		t.Fatalf("numero = %v", fields["numero"])
	}
	if fields["codigo_verificacao"] != "ABC123" {
		t.Fatalf("codigo_verificacao = %v", fields["codigo_verificacao"])
	}
}

func TestNFSeConsultResponseOmitsEmptyVerificationCode(t *testing.T) {
	body, err := json.Marshal(nfseConsultResponse{
		Document: fiscal.Document{DocumentType: "nfse", Status: "authorized"},
		consult:  fiscal.NFSeConsult{AccessKey: "NFS1", Numero: "3"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatal(err)
	}
	if _, ok := fields["codigo_verificacao"]; ok {
		t.Fatalf("empty codigo_verificacao was included: %s", body)
	}
}
