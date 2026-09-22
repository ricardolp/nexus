package organization

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/llm"
)

const (
	suggestNBSLimit          = 25
	suggestLC116Limit        = 25
	suggestPriorNotesLimit   = 8
	suggestDiscriminationMax = 2000
	suggestSystemPrompt      = `Você é um assistente fiscal brasileiro para classificação de NFS-e nacional (DPS).

Tarefa: dado um CNAE já escolhido e um rascunho da discriminação, escolher:
1. um código NBS
2. um item da lista LC 116
3. uma discriminação melhorada

Regras:
- Use APENAS códigos que aparecem em candidatos_nbs e candidatos_lc116.
- Nunca invente, complete ou "corrija" um código.
- Prefira o par NBS+LC 116 já usado nas notas_anteriores da empresa quando o serviço for o mesmo.
- Se o rascunho for vago, escreva uma discriminação clara, no infinitivo ou "Prestação de…", sem valor, sem alíquota e sem dados pessoais além do nome do tomador se fornecido.
- Não altere CNAE, município, ISS ou indOp.
- Responda somente JSON válido no schema pedido.`
)

var htmlTagPattern = regexp.MustCompile(`<[^>]+>`)

// SuggestNFSeClassificationInput is the UI payload for AI classification help.
type SuggestNFSeClassificationInput struct {
	OrganizationID      uuid.UUID
	CompanyID           uuid.UUID
	CNAECode            string
	DraftDiscrimination string
	CurrentNBS          string
	CurrentLC116        string
	CustomerID          uuid.UUID // optional
}

// SuggestNFSeClassificationResult is returned after LLM + code validation.
type SuggestNFSeClassificationResult struct {
	CodigoNBS        string  `json:"codigo_nbs"`
	NBSDescription   string  `json:"nbs_description"`
	ItemListaServico string  `json:"item_lista_servico"`
	LC116Description string  `json:"lc116_description"`
	Discriminacao    string  `json:"discriminacao"`
	Rationale        string  `json:"rationale"`
	Confidence       float64 `json:"confidence"`
	Source           string  `json:"source"`
}

type suggestCatalogItem struct {
	Codigo    string `json:"codigo"`
	Descricao string `json:"descricao"`
}

type suggestActivityItem struct {
	Descricao           string `json:"descricao"`
	NBS                 string `json:"nbs,omitempty"`
	LC116               string `json:"lc116,omitempty"`
	DiscriminacaoPadrao string `json:"discriminacao_padrao,omitempty"`
}

type suggestPriorNote struct {
	NBS           string `json:"nbs,omitempty"`
	LC116         string `json:"lc116,omitempty"`
	Discriminacao string `json:"discriminacao,omitempty"`
	Tomador       string `json:"tomador,omitempty"`
}

type llmSuggestPayload struct {
	CodigoNBS        string  `json:"codigo_nbs"`
	ItemListaServico string  `json:"item_lista_servico"`
	Discriminacao    string  `json:"discriminacao"`
	Rationale        string  `json:"rationale"`
	Confidence       float64 `json:"confidence"`
}

// ChatCompleter is satisfied by *llm.Client.
type ChatCompleter interface {
	Enabled() bool
	ChatJSON(ctx context.Context, req llm.ChatRequest) (string, error)
}

// SuggestNFSeClassification retrieves catalog/DB grounding, calls the LLM, and
// validates that returned NBS/LC116 codes are in the candidate sets.
func (s *Service) SuggestNFSeClassification(ctx context.Context, chat ChatCompleter, in SuggestNFSeClassificationInput) (*SuggestNFSeClassificationResult, error) {
	if chat == nil || !chat.Enabled() {
		return nil, domainerr.New(503, "llm_unconfigured", "Service Unavailable", "LLM_API_KEY is not set")
	}
	if err := s.ensureCompany(ctx, in.OrganizationID, in.CompanyID); err != nil {
		return nil, err
	}

	cnaeDigits := onlyDigits(in.CNAECode)
	if len(cnaeDigits) != 7 {
		return nil, domainerr.Validation("invalid_cnae", "cnae_code must be a 7-digit CNAE")
	}

	store, err := catalogs.Get()
	if err != nil {
		return nil, err
	}

	cnaeDesc := ""
	if item, ok := store.LookupCNAE(cnaeDigits); ok {
		cnaeDesc = item.Description
	}
	if cnaeDesc == "" {
		cnaes, listErr := s.ListCompanyCNAEs(ctx, in.OrganizationID, in.CompanyID)
		if listErr == nil {
			for _, c := range cnaes {
				if onlyDigits(c.CNAECode) == cnaeDigits {
					if c.CNAEDescription != nil {
						cnaeDesc = strings.TrimSpace(*c.CNAEDescription)
					}
					break
				}
			}
		}
	}

	currentNBS := strings.TrimSpace(in.CurrentNBS)
	currentLC := strings.TrimSpace(in.CurrentLC116)

	nbsCandidates := store.SearchNBS("", cnaeDigits, currentLC, true, suggestNBSLimit)
	lcCandidates := store.SearchLC116("", cnaeDigits, currentNBS, true, suggestLC116Limit)
	if len(nbsCandidates) == 0 || len(lcCandidates) == 0 {
		return nil, domainerr.Validation(
			"no_catalog_candidates",
			"Nenhum NBS ou LC 116 sugerido para este CNAE — selecione os códigos manualmente",
		)
	}

	nbsList := make([]suggestCatalogItem, 0, len(nbsCandidates))
	nbsSet := make(map[string]catalogs.NBS, len(nbsCandidates))
	for _, item := range nbsCandidates {
		nbsList = append(nbsList, suggestCatalogItem{Codigo: item.Code, Descricao: item.Description})
		nbsSet[item.Code] = item
		if digits := onlyDigits(item.Code); digits != "" {
			nbsSet[digits] = item
		}
		if item.CodeDigits != "" {
			nbsSet[item.CodeDigits] = item
		}
	}

	lcList := make([]suggestCatalogItem, 0, len(lcCandidates))
	lcSet := make(map[string]catalogs.LC116, len(lcCandidates))
	for _, item := range lcCandidates {
		lcList = append(lcList, suggestCatalogItem{Codigo: item.Code, Descricao: item.Description})
		lcSet[item.Code] = item
		lcSet[normalizeLC116(item.Code)] = item
	}

	activities, err := s.listActiveNFSeServicesForCNAE(ctx, in.OrganizationID, in.CompanyID, cnaeDigits)
	if err != nil {
		return nil, err
	}
	priors, err := s.listPriorNFSeNotesForCNAE(ctx, in.OrganizationID, in.CompanyID, cnaeDigits, suggestPriorNotesLimit)
	if err != nil {
		return nil, err
	}

	tomadorName := ""
	if in.CustomerID != uuid.Nil {
		if cust, cerr := s.GetCustomer(ctx, in.OrganizationID, in.CustomerID); cerr == nil && cust != nil {
			tomadorName = strings.TrimSpace(cust.LegalName)
		}
	}

	userPrompt := buildSuggestUserPrompt(suggestUserContext{
		CNAECode:        cnaeDigits,
		CNAEDescription: cnaeDesc,
		Draft:           strings.TrimSpace(in.DraftDiscrimination),
		CurrentNBS:      currentNBS,
		CurrentLC116:    currentLC,
		TomadorName:     tomadorName,
		Activities:      activities,
		Priors:          priors,
		CandidatosNBS:   nbsList,
		CandidatosLC116: lcList,
	})

	raw, err := chat.ChatJSON(ctx, llm.ChatRequest{
		Messages: []llm.Message{
			{Role: "system", Content: suggestSystemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2,
		JSONMode:    true,
	})
	if err != nil {
		return nil, domainerr.New(502, "llm_request_failed", "Bad Gateway", "Falha ao consultar o assistente de classificação")
	}

	parsed, err := parseLLMSuggestPayload(raw)
	if err != nil {
		return nil, domainerr.Validation("llm_invalid_json", "Resposta inválida do assistente de classificação")
	}

	result, ok := validateSuggestAgainstCandidates(parsed, nbsSet, lcSet)
	if !ok {
		// One retry with an explicit correction hint.
		retryPrompt := userPrompt + "\n\nCORREÇÃO: o código anterior estava fora das listas. Escolha APENAS códigos de candidatos_nbs e candidatos_lc116."
		raw2, err2 := chat.ChatJSON(ctx, llm.ChatRequest{
			Messages: []llm.Message{
				{Role: "system", Content: suggestSystemPrompt},
				{Role: "user", Content: retryPrompt},
			},
			Temperature: 0.1,
			JSONMode:    true,
		})
		if err2 != nil {
			return nil, domainerr.New(502, "llm_request_failed", "Bad Gateway", "Falha ao consultar o assistente de classificação")
		}
		parsed2, err2 := parseLLMSuggestPayload(raw2)
		if err2 != nil {
			return nil, domainerr.Validation("llm_invalid_json", "Resposta inválida do assistente de classificação")
		}
		result, ok = validateSuggestAgainstCandidates(parsed2, nbsSet, lcSet)
		if !ok {
			return nil, domainerr.Validation(
				"llm_invalid_codes",
				"O assistente retornou códigos fora da lista de candidatos — selecione NBS e LC 116 manualmente",
			)
		}
	}
	return result, nil
}

type suggestUserContext struct {
	CNAECode        string
	CNAEDescription string
	Draft           string
	CurrentNBS      string
	CurrentLC116    string
	TomadorName     string
	Activities      []suggestActivityItem
	Priors          []suggestPriorNote
	CandidatosNBS   []suggestCatalogItem
	CandidatosLC116 []suggestCatalogItem
}

func buildSuggestUserPrompt(ctx suggestUserContext) string {
	type payload struct {
		CNAE struct {
			Codigo    string `json:"codigo"`
			Descricao string `json:"descricao"`
		} `json:"cnae"`
		RascunhoUsuario string `json:"rascunho_usuario"`
		SelecaoAtual    struct {
			NBS   string `json:"nbs"`
			LC116 string `json:"lc116"`
		} `json:"selecao_atual"`
		Tomador *struct {
			Nome string `json:"nome"`
		} `json:"tomador,omitempty"`
		AtividadesCadastradas []suggestActivityItem `json:"atividades_cadastradas"`
		NotasAnteriores       []suggestPriorNote    `json:"notas_anteriores"`
		CandidatosNBS         []suggestCatalogItem  `json:"candidatos_nbs"`
		CandidatosLC116       []suggestCatalogItem  `json:"candidatos_lc116"`
	}
	var p payload
	p.CNAE.Codigo = ctx.CNAECode
	p.CNAE.Descricao = ctx.CNAEDescription
	p.RascunhoUsuario = ctx.Draft
	p.SelecaoAtual.NBS = ctx.CurrentNBS
	p.SelecaoAtual.LC116 = ctx.CurrentLC116
	if ctx.TomadorName != "" {
		p.Tomador = &struct {
			Nome string `json:"nome"`
		}{Nome: ctx.TomadorName}
	}
	p.AtividadesCadastradas = ctx.Activities
	if p.AtividadesCadastradas == nil {
		p.AtividadesCadastradas = []suggestActivityItem{}
	}
	p.NotasAnteriores = ctx.Priors
	if p.NotasAnteriores == nil {
		p.NotasAnteriores = []suggestPriorNote{}
	}
	p.CandidatosNBS = ctx.CandidatosNBS
	p.CandidatosLC116 = ctx.CandidatosLC116

	raw, _ := json.MarshalIndent(p, "", "  ")
	return string(raw) + `

Responda JSON:
{
  "codigo_nbs": "",
  "item_lista_servico": "",
  "discriminacao": "",
  "rationale": "",
  "confidence": 0.0
}`
}

func parseLLMSuggestPayload(raw string) (llmSuggestPayload, error) {
	raw = strings.TrimSpace(raw)
	// Strip optional markdown fences.
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```JSON")
		raw = strings.TrimPrefix(raw, "```")
		if idx := strings.LastIndex(raw, "```"); idx >= 0 {
			raw = raw[:idx]
		}
		raw = strings.TrimSpace(raw)
	}
	var out llmSuggestPayload
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return llmSuggestPayload{}, err
	}
	return out, nil
}

func validateSuggestAgainstCandidates(
	parsed llmSuggestPayload,
	nbsSet map[string]catalogs.NBS,
	lcSet map[string]catalogs.LC116,
) (*SuggestNFSeClassificationResult, bool) {
	nbsKey := strings.TrimSpace(parsed.CodigoNBS)
	lcKey := strings.TrimSpace(parsed.ItemListaServico)
	nbs, nbsOK := nbsSet[nbsKey]
	if !nbsOK {
		nbs, nbsOK = nbsSet[onlyDigits(nbsKey)]
	}
	lc, lcOK := lcSet[lcKey]
	if !lcOK {
		lc, lcOK = lcSet[normalizeLC116(lcKey)]
	}
	if !nbsOK || !lcOK {
		return nil, false
	}
	disc := sanitizeDiscrimination(parsed.Discriminacao)
	if disc == "" {
		return nil, false
	}
	conf := parsed.Confidence
	if conf < 0 {
		conf = 0
	}
	if conf > 1 {
		conf = 1
	}
	return &SuggestNFSeClassificationResult{
		CodigoNBS:        nbs.Code,
		NBSDescription:   nbs.Description,
		ItemListaServico: lc.Code,
		LC116Description: lc.Description,
		Discriminacao:    disc,
		Rationale:        strings.TrimSpace(parsed.Rationale),
		Confidence:       conf,
		Source:           "llm",
	}, true
}

func sanitizeDiscrimination(s string) string {
	s = strings.TrimSpace(s)
	s = htmlTagPattern.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > suggestDiscriminationMax {
		runes := []rune(s)
		s = string(runes[:suggestDiscriminationMax])
	}
	return s
}

func normalizeLC116(code string) string {
	code = strings.TrimSpace(code)
	digits := onlyDigits(code)
	if len(digits) == 4 {
		return digits[:2] + "." + digits[2:]
	}
	return code
}

func (s *Service) listActiveNFSeServicesForCNAE(ctx context.Context, orgID, companyID uuid.UUID, cnaeDigits string) ([]suggestActivityItem, error) {
	rows, err := s.pool.Query(ctx, `
		select coalesce(service_description, ''),
		       coalesce(nbs_code, ''),
		       coalesce(service_list_item, ''),
		       coalesce(default_discrimination, '')
		from organization_company_nfse_services
		where organization_id = $1
		  and organization_company_id = $2
		  and status = 'active'
		  and regexp_replace(coalesce(cnae_code, ''), '[^0-9]', '', 'g') = $3
		order by is_primary desc, is_favorite desc, sort_order, service_description
		limit 20
	`, orgID, companyID, cnaeDigits)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []suggestActivityItem
	for rows.Next() {
		var item suggestActivityItem
		if err := rows.Scan(&item.Descricao, &item.NBS, &item.LC116, &item.DiscriminacaoPadrao); err != nil {
			return nil, err
		}
		item.Descricao = strings.TrimSpace(item.Descricao)
		item.NBS = strings.TrimSpace(item.NBS)
		item.LC116 = strings.TrimSpace(item.LC116)
		item.DiscriminacaoPadrao = strings.TrimSpace(item.DiscriminacaoPadrao)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) listPriorNFSeNotesForCNAE(ctx context.Context, orgID, companyID uuid.UUID, cnaeDigits string, limit int) ([]suggestPriorNote, error) {
	if limit <= 0 {
		limit = suggestPriorNotesLimit
	}
	rows, err := s.pool.Query(ctx, `
		select coalesce(n.discrimination, ''),
		       coalesce(n.nbs_code, ''),
		       coalesce(n.service_list_item, ''),
		       coalesce(n.taker_legal_name, '')
		from organization_nfse n
		join organization_documents d on d.id = n.organization_document_id
		where d.organization_id = $1
		  and d.organization_company_id = $2
		  and d.document_type = 'nfse'
		  and d.direction = 'outbound'
		  and regexp_replace(coalesce(n.cnae_code, ''), '[^0-9]', '', 'g') = $3
		  and (
		    nullif(trim(n.discrimination), '') is not null
		    or nullif(trim(n.nbs_code), '') is not null
		    or nullif(trim(n.service_list_item), '') is not null
		  )
		order by coalesce(n.emission_date, d.received_at, d.created_at) desc
		limit $4
	`, orgID, companyID, cnaeDigits, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []suggestPriorNote
	for rows.Next() {
		var item suggestPriorNote
		if err := rows.Scan(&item.Discriminacao, &item.NBS, &item.LC116, &item.Tomador); err != nil {
			return nil, err
		}
		item.Discriminacao = strings.TrimSpace(item.Discriminacao)
		item.NBS = strings.TrimSpace(item.NBS)
		item.LC116 = strings.TrimSpace(item.LC116)
		item.Tomador = strings.TrimSpace(item.Tomador)
		out = append(out, item)
	}
	return out, rows.Err()
}
