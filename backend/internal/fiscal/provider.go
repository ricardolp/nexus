package fiscal

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Provider is the fiscal/SEFAZ connector boundary.
type Provider interface {
	Transmit(ctx context.Context, doc Document) (ProviderResult, error)
}

type ProviderResult struct {
	Outcome      string
	Provider     string
	HTTPStatus   int
	ErrorCode    string
	ErrorMessage string
	Protocol     string
}

// StubProvider simulates SEFAZ without external calls.
// Documents whose document_key contains "REJECT" are rejected; others authorized.
type StubProvider struct{}

func (StubProvider) Transmit(_ context.Context, doc Document) (ProviderResult, error) {
	time.Sleep(10 * time.Millisecond)
	if doc.DocumentKey != nil && strings.Contains(strings.ToUpper(*doc.DocumentKey), "REJECT") {
		return ProviderResult{
			Outcome:      "rejected",
			Provider:     "stub_sefaz",
			HTTPStatus:   200,
			ErrorCode:    "rejeicao_simulada",
			ErrorMessage: "Documento rejeitado pelo provedor stub",
		}, nil
	}
	return ProviderResult{
		Outcome:    "authorized",
		Provider:   "stub_sefaz",
		HTTPStatus: 200,
		Protocol:   fmt.Sprintf("PROT-%s", doc.ID.String()[:8]),
	}, nil
}
