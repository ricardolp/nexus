package danfe

import (
	"fmt"
	"math/big"
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

func alnumUpper(s string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		if (r >= '0' && r <= '9') || (r >= 'A' && r <= 'Z') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// formatDoc formats CNPJ (numeric or alphanumeric) and CPF.
func formatDoc(doc string) string {
	d := alnumUpper(doc)
	switch len(d) {
	case 14:
		return fmt.Sprintf("%s.%s.%s/%s-%s", d[0:2], d[2:5], d[5:8], d[8:12], d[12:14])
	case 11:
		return fmt.Sprintf("%s.%s.%s-%s", d[0:3], d[3:6], d[6:9], d[9:11])
	}
	return strings.TrimSpace(doc)
}

func formatCEP(cep string) string {
	d := digitsOnly(cep)
	if len(d) == 8 {
		return d[0:5] + "-" + d[5:]
	}
	return strings.TrimSpace(cep)
}

func formatPhone(fone string) string {
	d := digitsOnly(fone)
	switch len(d) {
	case 10:
		return fmt.Sprintf("(%s) %s-%s", d[0:2], d[2:6], d[6:])
	case 11:
		return fmt.Sprintf("(%s) %s-%s", d[0:2], d[2:7], d[7:])
	}
	return strings.TrimSpace(fone)
}

// formatKey groups the 44-digit access key in blocks of four.
func formatKey(key string) string {
	d := digitsOnly(key)
	var parts []string
	for i := 0; i < len(d); i += 4 {
		end := i + 4
		if end > len(d) {
			end = len(d)
		}
		parts = append(parts, d[i:end])
	}
	return strings.Join(parts, " ")
}

// formatNumberNF prints nNF as 000.000.001.
func formatNumberNF(n string) string {
	d := digitsOnly(n)
	if d == "" {
		return strings.TrimSpace(n)
	}
	for len(d) < 9 {
		d = "0" + d
	}
	return d[0:3] + "." + d[3:6] + "." + d[6:9]
}

func formatSerie(s string) string {
	d := digitsOnly(s)
	if d == "" {
		return strings.TrimSpace(s)
	}
	for len(d) < 3 {
		d = "0" + d
	}
	return d
}

// formatDecimal renders an XML decimal in pt-BR with thousands separators,
// at least minDec and at most maxDec fraction digits. Empty input stays empty:
// a tag absent from the XML is never printed as zero.
func formatDecimal(val string, minDec, maxDec int) string {
	val = strings.TrimSpace(val)
	if val == "" {
		return ""
	}
	r, ok := new(big.Rat).SetString(val)
	if !ok {
		return val
	}
	s := r.FloatString(maxDec)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	intPart, frac, _ := strings.Cut(s, ".")
	for len(frac) > minDec && strings.HasSuffix(frac, "0") {
		frac = frac[:len(frac)-1]
	}
	var b strings.Builder
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(c)
	}
	out := b.String()
	if frac != "" {
		out += "," + frac
	}
	if neg {
		out = "-" + out
	}
	return out
}

func money(v string) string { return formatDecimal(v, 2, 2) }

func qty(v string) string { return formatDecimal(v, 2, 4) }

func unitValue(v string) string { return formatDecimal(v, 2, 10) }

func percent(v string) string {
	f := formatDecimal(v, 2, 4)
	if f == "" {
		return ""
	}
	return f + "%"
}

func parseXMLTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// Dates keep the offset written in the XML (local time of the issuer).
func formatDate(s string) string {
	if t, ok := parseXMLTime(s); ok {
		return t.Format("02/01/2006")
	}
	return strings.TrimSpace(s)
}

func formatTime(s string) string {
	if t, ok := parseXMLTime(s); ok && len(strings.TrimSpace(s)) > 10 {
		return t.Format("15:04:05")
	}
	return ""
}

func formatDateTime(s string) string {
	if t, ok := parseXMLTime(s); ok {
		return t.Format("02/01/2006 15:04:05")
	}
	return strings.TrimSpace(s)
}

var crtLabels = map[string]string{
	"1": "1 - SIMPLES NACIONAL",
	"2": "2 - SIMPLES NACIONAL - EXCESSO DE SUBLIMITE",
	"3": "3 - REGIME NORMAL",
	"4": "4 - SIMPLES NACIONAL - MEI",
}

func formatCRT(crt string) string {
	crt = strings.TrimSpace(crt)
	if l, ok := crtLabels[crt]; ok {
		return l
	}
	return crt
}

var modFreteLabels = map[string]string{
	"0": "0 - Remetente",
	"1": "1 - Destinatário",
	"2": "2 - Terceiros",
	"3": "3 - Próprio Remetente",
	"4": "4 - Próprio Destinatário",
	"9": "9 - Sem Frete",
}

func formatModFrete(m string) string {
	m = strings.TrimSpace(m)
	if l, ok := modFreteLabels[m]; ok {
		return l
	}
	return m
}

func joinNonEmpty(sep string, parts ...string) string {
	var out []string
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, sep)
}

// sumDecimals adds XML decimals; returns "" when none is present.
func sumDecimals(vals ...string) string {
	total := new(big.Rat)
	any := false
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		r, ok := new(big.Rat).SetString(v)
		if !ok {
			continue
		}
		total.Add(total, r)
		any = true
	}
	if !any {
		return ""
	}
	return total.FloatString(4)
}
