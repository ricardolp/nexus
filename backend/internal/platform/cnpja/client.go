package cnpja

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

const defaultBaseURL = "https://open.cnpja.com"

// Activity is a CNAE subclass from Receita Federal.
type Activity struct {
	Code        string `json:"code"`
	Description string `json:"description"`
	IsPrimary   bool   `json:"is_primary"`
}

// OfficeSummary is the subset we map into organization_customers / company CNAEs.
type OfficeSummary struct {
	CNPJ             string     `json:"cnpj"`
	LegalName        string     `json:"legal_name"`
	TradeName        *string    `json:"trade_name,omitempty"`
	Status           string     `json:"status"`
	Email            *string    `json:"email,omitempty"`
	Phone            *string    `json:"phone,omitempty"`
	Street           *string    `json:"street,omitempty"`
	Number           *string    `json:"number,omitempty"`
	Complement       *string    `json:"complement,omitempty"`
	District         *string    `json:"district,omitempty"`
	MunicipalityCode *string    `json:"municipality_code,omitempty"`
	City             *string    `json:"city,omitempty"`
	UF               *string    `json:"uf,omitempty"`
	CEP              *string    `json:"cep,omitempty"`
	MainActivity     *Activity  `json:"main_activity,omitempty"`
	SideActivities   []Activity `json:"side_activities,omitempty"`
	Source           string     `json:"-"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient() *Client {
	return NewClientForTest(defaultBaseURL)
}

// NewClientForTest builds a client pointed at baseURL (no trailing slash).
func NewClientForTest(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 12 * time.Second,
		},
	}
}

func (c *Client) LookupOffice(ctx context.Context, cnpj string) (*OfficeSummary, error) {
	digits := onlyDigits(cnpj)
	if len(digits) != 14 {
		return nil, domainerr.Validation("invalid_cnpj", "CNPJ deve ter 14 dígitos")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/office/"+digits, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, domainerr.New(503, "cnpj_lookup_unavailable", "Service Unavailable", "Não foi possível consultar o CNPJ na Receita. Tente novamente em instantes.")
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))

	switch res.StatusCode {
	case http.StatusOK:
		// continue
	case http.StatusNotFound:
		return nil, domainerr.NotFound("cnpj_not_found", "CNPJ não encontrado na Receita Federal")
	case http.StatusTooManyRequests:
		return nil, domainerr.TooManyRequests("Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.")
	default:
		return nil, domainerr.New(502, "cnpj_lookup_failed", "Bad Gateway", "Não foi possível consultar o CNPJ na Receita")
	}

	var raw openOfficeResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, domainerr.New(502, "cnpj_lookup_parse_error", "Bad Gateway", "Não foi possível ler o retorno da Receita para este CNPJ")
	}
	return mapOffice(digits, raw), nil
}

type openOfficeResponse struct {
	TaxID   string `json:"taxId"`
	Alias   string `json:"alias"`
	Status  struct {
		Text string `json:"text"`
	} `json:"status"`
	Company struct {
		Name string `json:"name"`
	} `json:"company"`
	Address struct {
		Municipality int    `json:"municipality"`
		Street       string `json:"street"`
		Number       string `json:"number"`
		District     string `json:"district"`
		City         string `json:"city"`
		State        string `json:"state"`
		Details      string `json:"details"`
		Zip          string `json:"zip"`
	} `json:"address"`
	Phones []struct {
		Area   string `json:"area"`
		Number string `json:"number"`
	} `json:"phones"`
	Emails []struct {
		Address string `json:"address"`
	} `json:"emails"`
	MainActivity struct {
		ID   int    `json:"id"`
		Text string `json:"text"`
	} `json:"mainActivity"`
	SideActivities []struct {
		ID   int    `json:"id"`
		Text string `json:"text"`
	} `json:"sideActivities"`
}

func mapOffice(cnpj string, raw openOfficeResponse) *OfficeSummary {
	out := &OfficeSummary{
		CNPJ:      cnpj,
		LegalName: strings.TrimSpace(raw.Company.Name),
		Status:    strings.TrimSpace(raw.Status.Text),
		Source:    "receita",
	}
	if alias := strings.TrimSpace(raw.Alias); alias != "" {
		out.TradeName = &alias
	}
	if s := strings.TrimSpace(raw.Address.Street); s != "" {
		out.Street = &s
	}
	if n := strings.TrimSpace(raw.Address.Number); n != "" {
		out.Number = &n
	}
	if d := strings.TrimSpace(raw.Address.Details); d != "" {
		out.Complement = &d
	}
	if b := strings.TrimSpace(raw.Address.District); b != "" {
		out.District = &b
	}
	if city := strings.TrimSpace(raw.Address.City); city != "" {
		out.City = &city
	}
	if uf := strings.ToUpper(strings.TrimSpace(raw.Address.State)); uf != "" {
		out.UF = &uf
	}
	if zip := onlyDigits(raw.Address.Zip); len(zip) == 8 {
		out.CEP = &zip
	}
	if raw.Address.Municipality > 0 {
		code := fmt.Sprintf("%07d", raw.Address.Municipality)
		out.MunicipalityCode = &code
	}
	if len(raw.Emails) > 0 {
		if e := strings.TrimSpace(raw.Emails[0].Address); e != "" {
			out.Email = &e
		}
	}
	if len(raw.Phones) > 0 {
		area := onlyDigits(raw.Phones[0].Area)
		num := onlyDigits(raw.Phones[0].Number)
		if area != "" && num != "" {
			phone := area + num
			out.Phone = &phone
		}
	}
	if raw.MainActivity.ID > 0 {
		code := fmt.Sprintf("%07d", raw.MainActivity.ID)
		out.MainActivity = &Activity{
			Code:        code,
			Description: strings.TrimSpace(raw.MainActivity.Text),
			IsPrimary:   true,
		}
	}
	for _, side := range raw.SideActivities {
		if side.ID <= 0 {
			continue
		}
		out.SideActivities = append(out.SideActivities, Activity{
			Code:        fmt.Sprintf("%07d", side.ID),
			Description: strings.TrimSpace(side.Text),
			IsPrimary:   false,
		})
	}
	return out
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
