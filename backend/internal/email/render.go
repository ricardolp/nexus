package email

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

type RenderContext struct {
	ClientName         string
	DestinatarioNome   string
	DestinatarioCnpj   string
	DestinatarioEmail  string
	EmitenteNome       string
	EmitenteCnpj       string
	Numero             string
	Serie              string
	Chave              string
	Valor              string
	DataEmissao        string
	EmpresaNome        string
	NaturezaOperacao   string
}

var tokenPattern = regexp.MustCompile(`\{\{([a-zA-Z]+)\}\}`)

var allowedTokens = map[string]func(RenderContext) string{
	"clientName":         func(c RenderContext) string { return c.ClientName },
	"destinatarioNome":   func(c RenderContext) string { return c.DestinatarioNome },
	"destinatarioCnpj":   func(c RenderContext) string { return c.DestinatarioCnpj },
	"destinatarioEmail":  func(c RenderContext) string { return c.DestinatarioEmail },
	"emitenteNome":       func(c RenderContext) string { return c.EmitenteNome },
	"emitenteCnpj":       func(c RenderContext) string { return c.EmitenteCnpj },
	"numero":             func(c RenderContext) string { return c.Numero },
	"serie":              func(c RenderContext) string { return c.Serie },
	"chave":              func(c RenderContext) string { return c.Chave },
	"valor":              func(c RenderContext) string { return c.Valor },
	"dataEmissao":        func(c RenderContext) string { return c.DataEmissao },
	"empresaNome":        func(c RenderContext) string { return c.EmpresaNome },
	"naturezaOperacao":   func(c RenderContext) string { return c.NaturezaOperacao },
}

func RenderTokens(template string, ctx RenderContext) string {
	return tokenPattern.ReplaceAllStringFunc(template, func(match string) string {
		name := strings.TrimSuffix(strings.TrimPrefix(match, "{{"), "}}")
		if fn, ok := allowedTokens[name]; ok {
			return fn(ctx)
		}
		return match
	})
}

func FormatIssuedAt(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("02/01/2006 15:04")
}

func FormatMoney(v float64) string {
	if v == 0 {
		return ""
	}
	s := fmt.Sprintf("%.2f", v)
	s = strings.ReplaceAll(s, ".", ",")
	return s
}
