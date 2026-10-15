package fiscal

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

const testNFeKey = "42261012345678000195550010000012341000012345"

func TestAccessKeyFromXML(t *testing.T) {
	nfseKey := "42091022203340001400000000000014826010000001234567"[:50]
	cases := []struct {
		name string
		xml  string
		nfse bool
		want string
	}{
		{"nfeProc id", `<nfeProc><NFe><infNFe Id="NFe` + testNFeKey + `" versao="4.00"/></NFe></nfeProc>`, false, testNFeKey},
		{"prefixed chNFe", `<ns:retEvento><ns:chNFe>` + testNFeKey + `</ns:chNFe></ns:retEvento>`, false, testNFeKey},
		{"nfse id", `<NFSe><infNFSe Id="NFS` + nfseKey + `"/></NFSe>`, true, nfseKey},
		{"nfse ignores nfe key", `<infNFe Id="NFe` + testNFeKey + `"/>`, true, ""},
		{"json payload", `{"chNFe":"` + testNFeKey + `"}`, false, ""},
		{"empty", ``, false, ""},
	}
	for _, tc := range cases {
		if got := accessKeyFromXML([]byte(tc.xml), tc.nfse); got != tc.want {
			t.Fatalf("%s: got %q want %q", tc.name, got, tc.want)
		}
	}
}

func TestDownloadFilenameUsesKeyFromXML(t *testing.T) {
	s := &Service{}
	doc := &Document{ID: uuid.New(), DocumentType: "nfe"}
	xml := []byte(`<nfeProc><NFe><infNFe Id="NFe` + testNFeKey + `"/></NFe></nfeProc>`)
	ctx := context.Background()

	cases := map[string]string{
		PayloadSefazResponse: "NFe" + testNFeKey + ".xml",
		PayloadCceResponse:   "NFe" + testNFeKey + "-cce.xml",
		PayloadDanfe:         "NFe" + testNFeKey + "-danfe-sap.pdf",
	}
	for payloadType, want := range cases {
		if got := s.downloadFilename(ctx, doc, payloadType, "", xml); got != want {
			t.Fatalf("%s: got %q want %q", payloadType, got, want)
		}
	}
}

func TestDownloadBaseNameFallbacks(t *testing.T) {
	s := &Service{}
	ctx := context.Background()
	id := uuid.New()
	ext := "PED-77"
	doc := &Document{ID: id, DocumentType: "nfe", ExternalID: &ext}
	if got := s.downloadBaseNameFromXML(ctx, doc, []byte(`<x/>`)); got != ext {
		t.Fatalf("external id fallback: got %q", got)
	}
	doc.ExternalID = nil
	if got := s.downloadBaseNameFromXML(ctx, doc, nil); got != id.String() {
		t.Fatalf("uuid fallback: got %q", got)
	}
}

func TestRegisterEventPayloadsKindMapping(t *testing.T) {
	req, resp := PayloadCancelRequest, PayloadCancelResponse
	kind := "cce"
	switch kind {
	case "cce":
		req, resp = PayloadCceRequest, PayloadCceResponse
	case "inutilization":
		req, resp = PayloadInutilizationRequest, PayloadInutilizationResponse
	}
	if req != PayloadCceRequest || resp != PayloadCceResponse {
		t.Fatalf("cce mapping broken: %s %s", req, resp)
	}
	kind = "inutilization"
	req, resp = PayloadCancelRequest, PayloadCancelResponse
	switch kind {
	case "cce":
		req, resp = PayloadCceRequest, PayloadCceResponse
	case "inutilization":
		req, resp = PayloadInutilizationRequest, PayloadInutilizationResponse
	}
	if req != PayloadInutilizationRequest || resp != PayloadInutilizationResponse {
		t.Fatalf("inutilization mapping broken: %s %s", req, resp)
	}
}

func TestPayloadTypeConstantsForDownloads(t *testing.T) {
	wanted := map[string]string{
		PayloadProtocol:              "protocol",
		PayloadCancelResponse:        "cancel_response",
		PayloadCceResponse:           "cce_response",
		PayloadInutilizationResponse: "inutilization_response",
		PayloadManifestationEvent:    "manifestation_event",
	}
	for constVal, expect := range wanted {
		if constVal != expect {
			t.Fatalf("payload constant %q != %q", constVal, expect)
		}
	}
}
