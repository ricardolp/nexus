package danfse

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"
)

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func dash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

func formatDoc(doc string) string {
	d := digitsOnly(doc)
	if len(d) == 14 {
		return fmt.Sprintf("%s.%s.%s/%s-%s", d[0:2], d[2:5], d[5:8], d[8:12], d[12:14])
	} else if len(d) == 11 {
		return fmt.Sprintf("%s.%s.%s-%s", d[0:3], d[3:6], d[6:9], d[9:11])
	}
	return dash(doc)
}

func formatCEP(cep string) string {
	d := digitsOnly(cep)
	if len(d) == 8 {
		return fmt.Sprintf("%s.%s-%s", d[0:2], d[2:5], d[5:8])
	}
	return dash(cep)
}

func formatIBGE(cMun string) string {
	d := digitsOnly(cMun)
	if len(d) == 7 {
		return d[0:2] + "." + d[2:]
	}
	return dash(cMun)
}

func formatIBGECEP(cMun, cep string) string {
	ibge := formatIBGE(cMun)
	cepF := formatCEP(cep)
	if ibge == "-" && cepF == "-" {
		return "-"
	}
	if ibge == "-" {
		return cepF
	}
	if cepF == "-" {
		return ibge
	}
	return ibge + " / " + cepF
}

func formatNBS(nbs string) string {
	d := digitsOnly(nbs)
	if len(d) == 9 {
		return d[0:1] + "." + d[1:5] + "." + d[5:7] + "." + d[7:9]
	}
	return dash(nbs)
}

func formatTribNac(code string) string {
	d := digitsOnly(code)
	if len(d) == 6 {
		return d[0:2] + "." + d[2:4] + "." + d[4:6]
	}
	return dash(code)
}

func formatTribNacMun(nac, mun string) string {
	n := formatTribNac(nac)
	m := strings.TrimSpace(mun)
	if m == "" {
		m = "-"
	}
	if n == "-" && m == "-" {
		return "-"
	}
	return n + " / " + m
}

func formatCurrency(val string) string {
	if val == "" || val == "-" {
		return val
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(val, ",", "."), 64)
	if err != nil {
		return val
	}
	parts := strings.Split(fmt.Sprintf("%.2f", f), ".")
	intPart := parts[0]
	decPart := parts[1]
	neg := false
	if strings.HasPrefix(intPart, "-") {
		neg = true
		intPart = intPart[1:]
	}
	var withSeps string
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			withSeps += "."
		}
		withSeps += string(c)
	}
	out := "R$ " + withSeps + "," + decPart
	if neg {
		out = "-" + out
	}
	return out
}

func formatCurrencyOrDash(val string) string {
	if strings.TrimSpace(val) == "" {
		return "-"
	}
	return formatCurrency(val)
}

func formatPercent(val string) string {
	if strings.TrimSpace(val) == "" {
		return "-"
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(val, ",", "."), 64)
	if err != nil {
		return val
	}
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if !strings.Contains(s, ".") {
		s += ".00"
	} else {
		parts := strings.SplitN(s, ".", 2)
		for len(parts[1]) < 2 {
			parts[1] += "0"
		}
		s = parts[0] + "." + parts[1]
	}
	s = strings.ReplaceAll(s, ".", ",")
	return s + " %"
}

func formatPercentPair(a, b string) string {
	return formatPercent(a) + " / " + formatPercent(b)
}

func formatPercentTriple(a, b, c string) string {
	return formatPercent(a) + " / " + formatPercent(b) + " / " + formatPercent(c)
}

func parseFloatOrZero(val string) float64 {
	if strings.TrimSpace(val) == "" {
		return 0
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(val, ",", "."), 64)
	if err != nil {
		return 0
	}
	return f
}

func formatDateBR(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "-"
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.Format("02/01/2006")
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Format("02/01/2006")
	}
	// Truncate datetime without timezone parsing when possible.
	if len(s) >= 10 && s[4] == '-' && s[7] == '-' {
		if t, err := time.Parse("2006-01-02", s[:10]); err == nil {
			return t.Format("02/01/2006")
		}
	}
	return s
}

func formatDateTimeBR(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "-"
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Format("02/01/2006 15:04:05")
	}
	layouts := []string{
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Format("02/01/2006 15:04:05")
		}
	}
	return s
}

func formatPhone(p string) string {
	d := digitsOnly(p)
	if len(d) == 10 {
		return fmt.Sprintf("(%s) %s-%s", d[0:2], d[2:6], d[6:10])
	} else if len(d) == 11 {
		return fmt.Sprintf("(%s) %s-%s", d[0:2], d[2:7], d[7:11])
	}
	return dash(p)
}

func truncateDesc(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	if max <= 3 {
		return string(runes[:max])
	}
	return string(runes[:max-3]) + "..."
}

func formatTpEmit(code string) string {
	switch code {
	case "1":
		return "Prestador"
	case "2":
		return "Tomador"
	case "3":
		return "Intermediário"
	case "":
		return "-"
	default:
		return code
	}
}

func formatCStat(code string) string {
	switch code {
	case "100":
		return "NFS-e Gerada"
	case "101":
		return "NFS-e de Decisão Judicial"
	case "102", "103":
		return truncateDesc("NFS-e de Decisão Judicial ou Administrativa", 37)
	case "":
		return "-"
	default:
		return code
	}
}

func formatFinNFSe(code string) string {
	switch code {
	case "0", "1":
		return "NFS-e regular"
	case "2":
		return "NFS-e de crédito"
	case "3":
		return "NFS-e de débito"
	case "":
		return "-"
	default:
		return truncateDesc(code, 37)
	}
}

func formatTribISSQN(code string) string {
	switch code {
	case "1":
		return "Operação Tributável"
	case "2":
		return "Exportação de Serviço"
	case "3":
		return "Não Incidência"
	case "4":
		return "Imunidade"
	case "":
		return "-"
	default:
		return code
	}
}

func formatRegEspTrib(code string) string {
	switch code {
	case "0":
		return "Nenhum"
	case "1":
		return "Microempresa Municipal"
	case "2":
		return "Estimativa"
	case "3":
		return "Sociedade de Profissionais"
	case "4":
		return "Cooperativa"
	case "5":
		return "MEI"
	case "6":
		return "ME/EPP"
	case "9":
		return "Outros"
	case "":
		return "-"
	default:
		return code
	}
}

func formatTpRetISSQN(code string) string {
	switch code {
	case "1":
		return "Não Retido"
	case "2":
		return "Retido pelo Tomador"
	case "3":
		return "Retido pelo Intermediário"
	case "":
		return "-"
	default:
		return code
	}
}

func formatTpSusp(code string) string {
	switch code {
	case "0":
		return "Não"
	case "1":
		return "Exigibilidade Suspensa por Decisão Judicial"
	case "2":
		return "Exigibilidade Suspensa por Processo Administrativo"
	case "":
		return "-"
	default:
		return code
	}
}

func formatOpSimpNac(code string) string {
	switch code {
	case "1":
		return "Não Optante"
	case "2":
		return "Optante - MEI"
	case "3":
		return truncateDesc("Optante - Microempresa ou Empresa de Pequeno Porte", 37)
	case "":
		return "-"
	default:
		return code
	}
}

func formatRegApTribSN(code string) string {
	switch code {
	case "1":
		return truncateDesc("Regime de apuração dos tributos federais e municipal pelo Simples Nacional", 60)
	case "2":
		return "MEI"
	case "":
		return "-"
	default:
		return code
	}
}

func formatTpRetPisCofins(code string) string {
	switch code {
	case "0", "1":
		return "0 - PIS/COFINS/CSLL Não Retidos"
	case "2":
		return "2 - Retido pelo Tomador"
	case "3":
		return "3 - Retido pelo Intermediário"
	case "":
		return "-"
	default:
		return code
	}
}

func formatMunUF(xMun, cMun, uf string) string {
	mun := xMun
	if mun == "" {
		mun = ibgeCities[cMun]
	}
	if mun == "" {
		mun = cMun
	}
	if uf == "" {
		uf = ufFromIBGE(cMun)
	}
	if mun == "" {
		if uf != "" {
			return uf
		}
		return "-"
	}
	if uf != "" {
		return mun + " / " + uf
	}
	return mun
}

func formatLocIncid(xLoc, cLoc, pais string) string {
	loc := strings.TrimSpace(xLoc)
	if loc == "" {
		loc = ibgeCities[cLoc]
	}
	if loc == "" {
		loc = cLoc
	}
	if loc == "" {
		return "-"
	}
	if uf := ufFromIBGE(cLoc); uf != "" {
		loc += " / " + uf
	}
	if strings.TrimSpace(pais) != "" {
		loc += " / " + pais
	} else {
		loc += " / -"
	}
	return loc
}

func formatCSTClass(cst, cClass string) string {
	c := dash(strings.TrimSpace(cst))
	cl := dash(strings.TrimSpace(cClass))
	return c + " / " + cl
}

func formatIndOpLocal(cIndOp, cLoc, xLoc string) string {
	parts := make([]string, 0, 4)
	if strings.TrimSpace(cIndOp) != "" {
		parts = append(parts, cIndOp)
	}
	if strings.TrimSpace(cLoc) != "" {
		parts = append(parts, cLoc)
	}
	munUF := formatMunUF(xLoc, cLoc, "")
	if munUF != "-" && munUF != "" {
		parts = append(parts, munUF)
	}
	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, " / ")
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// lei12741Line builds the approximate tax totals line (portal always prints it).
func lei12741Line(pTotTribSN, vFed, vEst, vMun string) string {
	_ = pTotTribSN // retained for callers that only have SN %; amounts drive the line text
	fmtOrDash := func(v string) string {
		if strings.TrimSpace(v) == "" {
			return "-"
		}
		return formatCurrency(v)
	}
	return fmt.Sprintf(
		"Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: %s; Estaduais: %s; Municipais: %s;",
		fmtOrDash(vFed), fmtOrDash(vEst), fmtOrDash(vMun),
	)
}

func sumExclusoes(vals ...string) string {
	var total float64
	any := false
	for _, v := range vals {
		if strings.TrimSpace(v) == "" {
			continue
		}
		any = true
		total += parseFloatOrZero(v)
	}
	if !any {
		return formatCurrency("0")
	}
	return formatCurrency(fmt.Sprintf("%.2f", total))
}

func sumCurrency(a, b string) string {
	if strings.TrimSpace(a) == "" && strings.TrimSpace(b) == "" {
		return "-"
	}
	total := parseFloatOrZero(a) + parseFloatOrZero(b)
	return formatCurrency(fmt.Sprintf("%.2f", total))
}
