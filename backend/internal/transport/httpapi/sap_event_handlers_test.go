package httpapi

import (
	"errors"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func TestRejectSAPEventOnEmissionRoute(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{"cce body", `{"correcao":"ASD ASDASDASDASD","data_evento":"2026-09-27T19:40:37-03:00"}`, true},
		{"cancel body", `{"chave_acesso":"1","justificativa":"Erro na emissao"}`, true},
		{"emission body", `{"cnpj_emitente":"12345678000190","justificativa":"x"}`, false},
		{"not json", `<NFe/>`, false},
		{"plain emission", `{"cnpj_emitente":"12345678000190"}`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := rejectSAPEventOnEmissionRoute([]byte(tc.body))
			if (err != nil) != tc.wantErr {
				t.Fatalf("err=%v, wantErr=%v", err, tc.wantErr)
			}
			var de *domainerr.Error
			if err != nil && (!errors.As(err, &de) || de.Code != "use_event_endpoint") {
				t.Fatalf("err=%v, want use_event_endpoint", err)
			}
		})
	}
}
