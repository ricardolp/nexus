package viacep

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const defaultBaseURL = "https://viacep.com.br"

type Address struct {
	CEP              string  `json:"cep"`
	Street           string  `json:"street"`
	Complement       *string `json:"complement,omitempty"`
	District         string  `json:"district"`
	City             string  `json:"city"`
	UF               string  `json:"uf"`
	MunicipalityCode string  `json:"municipality_code"`
	Source           string  `json:"source"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient() *Client {
	return NewClientForTest(defaultBaseURL)
}

func NewClientForTest(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) Lookup(ctx context.Context, cep string) (*Address, error) {
	digits := onlyDigits(cep)
	if len(digits) != 8 {
		return nil, domainerr.Validation("invalid_cep", "CEP must contain 8 digits")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/ws/"+digits+"/json/", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, domainerr.New(503, "cep_lookup_unavailable", "Service Unavailable", "Could not reach CEP lookup service")
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))

	if res.StatusCode != http.StatusOK {
		if res.StatusCode == http.StatusBadRequest {
			return nil, domainerr.Validation("invalid_cep", "CEP format is invalid")
		}
		return nil, domainerr.New(502, "cep_lookup_failed", "Bad Gateway", fmt.Sprintf("CEP lookup failed (%d)", res.StatusCode))
	}

	var raw struct {
		Erro        bool   `json:"erro"`
		CEP         string `json:"cep"`
		Logradouro  string `json:"logradouro"`
		Complemento string `json:"complemento"`
		Bairro      string `json:"bairro"`
		Localidade  string `json:"localidade"`
		UF          string `json:"uf"`
		IBGE        string `json:"ibge"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, domainerr.New(502, "cep_lookup_parse_error", "Bad Gateway", "Failed to parse CEP lookup response")
	}
	if raw.Erro {
		return nil, domainerr.NotFound("cep_not_found", "CEP not found")
	}

	out := &Address{
		CEP:              digits,
		Street:           strings.TrimSpace(raw.Logradouro),
		District:         strings.TrimSpace(raw.Bairro),
		City:             strings.TrimSpace(raw.Localidade),
		UF:               strings.ToUpper(strings.TrimSpace(raw.UF)),
		MunicipalityCode: onlyDigits(raw.IBGE),
		Source:           "viacep",
	}
	if c := strings.TrimSpace(raw.Complemento); c != "" {
		out.Complement = &c
	}
	if len(out.MunicipalityCode) > 0 && len(out.MunicipalityCode) != 7 {
		out.MunicipalityCode = fmt.Sprintf("%07s", out.MunicipalityCode)
	}
	return out, nil
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
