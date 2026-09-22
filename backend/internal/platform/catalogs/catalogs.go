package catalogs

import (
	_ "embed"
	"encoding/json"
	"sort"
	"strings"
	"sync"
	"unicode"
)

//go:embed static/cnae.json
var cnaeJSON []byte

//go:embed static/nbs.json
var nbsJSON []byte

//go:embed static/municipios.json
var municipiosJSON []byte

//go:embed static/lc116.json
var lc116JSON []byte

//go:embed static/cnae_nbs_hints.json
var cnaeNBSHintsJSON []byte

//go:embed static/cnae_lc116_hints.json
var cnaeLC116HintsJSON []byte

//go:embed static/nbs_lc116.json
var nbsLC116JSON []byte

type CNAE struct {
	Code        string `json:"code"`
	Description string `json:"description"`
}

type NBS struct {
	Code        string `json:"code"`
	CodeDigits  string `json:"code_digits"`
	Description string `json:"description"`
	Suggested   bool   `json:"suggested,omitempty"`
}

type LC116 struct {
	Code        string `json:"code"`
	Description string `json:"description"`
	Suggested   bool   `json:"suggested,omitempty"`
}

type Municipality struct {
	Code string `json:"code"`
	Name string `json:"name"`
	UF   string `json:"uf"`
}

type Store struct {
	CNAEs          []CNAE
	cnaeByCode     map[string]CNAE
	NBS            []NBS
	nbsByCode      map[string]NBS
	nbsByDigits    map[string]NBS
	LC116          []LC116
	lc116ByCode    map[string]LC116
	Municipalities []Municipality
	muniByCode     map[string]Municipality
	hints          map[string][]string // CNAE division (2 digits) -> NBS prefixes
	lc116Hints     map[string][]string // CNAE division (2 digits) -> LC116 codes
	lc116ByNBS     map[string][]string // NBS digits -> LC116 codes (Anexo VIII)
	nbsByLC116     map[string][]string // LC116 code -> NBS digits
}

var (
	once    sync.Once
	store   *Store
	loadErr error
)

func Get() (*Store, error) {
	once.Do(func() {
		store, loadErr = load()
	})
	return store, loadErr
}

func load() (*Store, error) {
	s := &Store{
		cnaeByCode:  map[string]CNAE{},
		nbsByCode:   map[string]NBS{},
		nbsByDigits: map[string]NBS{},
		lc116ByCode: map[string]LC116{},
		muniByCode:  map[string]Municipality{},
		hints:       map[string][]string{},
		lc116Hints:  map[string][]string{},
		lc116ByNBS:  map[string][]string{},
		nbsByLC116:  map[string][]string{},
	}
	if err := json.Unmarshal(cnaeJSON, &s.CNAEs); err != nil {
		return nil, err
	}
	for _, item := range s.CNAEs {
		code := onlyDigits(item.Code)
		if len(code) < 7 {
			continue
		}
		item.Code = code
		s.cnaeByCode[code] = item
	}
	if err := json.Unmarshal(nbsJSON, &s.NBS); err != nil {
		return nil, err
	}
	for _, item := range s.NBS {
		s.nbsByCode[item.Code] = item
		if item.CodeDigits != "" {
			s.nbsByDigits[item.CodeDigits] = item
		}
	}
	if err := json.Unmarshal(lc116JSON, &s.LC116); err != nil {
		return nil, err
	}
	for _, item := range s.LC116 {
		code := normalizeLC116Code(item.Code)
		item.Code = code
		s.lc116ByCode[code] = item
		s.lc116ByCode[onlyDigits(code)] = item
	}
	if err := json.Unmarshal(municipiosJSON, &s.Municipalities); err != nil {
		return nil, err
	}
	for _, item := range s.Municipalities {
		code := onlyDigits(item.Code)
		if len(code) != 7 {
			continue
		}
		item.Code = code
		item.UF = strings.ToUpper(strings.TrimSpace(item.UF))
		s.muniByCode[code] = item
	}
	if err := json.Unmarshal(cnaeNBSHintsJSON, &s.hints); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(cnaeLC116HintsJSON, &s.lc116Hints); err != nil {
		return nil, err
	}
	var nbsLC116 map[string][]string
	if err := json.Unmarshal(nbsLC116JSON, &nbsLC116); err != nil {
		return nil, err
	}
	for nbs, codes := range nbsLC116 {
		digits := onlyDigits(nbs)
		if digits == "" {
			continue
		}
		s.lc116ByNBS[digits] = codes
		for _, code := range codes {
			norm := normalizeLC116Code(code)
			s.nbsByLC116[norm] = append(s.nbsByLC116[norm], digits)
		}
	}
	return s, nil
}

func (s *Store) LookupCNAE(code string) (CNAE, bool) {
	item, ok := s.cnaeByCode[onlyDigits(code)]
	return item, ok
}

func (s *Store) LookupNBS(code string) (NBS, bool) {
	code = strings.TrimSpace(code)
	if item, ok := s.nbsByCode[code]; ok {
		return item, true
	}
	digits := onlyDigits(code)
	if item, ok := s.nbsByDigits[digits]; ok {
		return item, true
	}
	return NBS{}, false
}

func (s *Store) LookupLC116(code string) (LC116, bool) {
	code = normalizeLC116Code(code)
	if item, ok := s.lc116ByCode[code]; ok {
		return item, true
	}
	if item, ok := s.lc116ByCode[onlyDigits(code)]; ok {
		return item, true
	}
	return LC116{}, false
}

func (s *Store) LookupMunicipality(code string) (Municipality, bool) {
	item, ok := s.muniByCode[onlyDigits(code)]
	return item, ok
}

func (s *Store) SearchCNAE(q string, limit int) []CNAE {
	if limit <= 0 {
		limit = 30
	}
	q = normalize(q)
	if q == "" {
		out := make([]CNAE, 0, min(limit, len(s.CNAEs)))
		for i := 0; i < len(s.CNAEs) && i < limit; i++ {
			out = append(out, s.CNAEs[i])
		}
		return out
	}
	digits := onlyDigits(q)
	var out []CNAE
	for _, item := range s.CNAEs {
		if digits != "" && strings.HasPrefix(item.Code, digits) {
			out = append(out, item)
		} else if strings.Contains(normalize(item.Description), q) {
			out = append(out, item)
		}
		if len(out) >= limit {
			break
		}
	}
	return out
}

func (s *Store) SearchNBS(q string, cnaeHint string, lc116Hint string, suggestedOnly bool, limit int) []NBS {
	if limit <= 0 {
		limit = 40
	}
	prefixes := s.NBSPrefixesForCNAE(cnaeHint)
	lc116Digits := s.nbsDigitSetForLC116(lc116Hint)
	qNorm := normalize(q)
	qDigits := onlyDigits(q)

	var suggested, rest []NBS
	for _, item := range s.NBS {
		isSuggested := nbsSuggested(item, prefixes, lc116Digits)
		if suggestedOnly && !isSuggested {
			continue
		}
		if qNorm != "" || qDigits != "" {
			match := false
			if qDigits != "" && (strings.HasPrefix(item.CodeDigits, qDigits) || strings.Contains(item.Code, q)) {
				match = true
			}
			if !match && qNorm != "" && strings.Contains(normalize(item.Description), qNorm) {
				match = true
			}
			if !match && qNorm != "" && strings.Contains(normalize(item.Code), qNorm) {
				match = true
			}
			if !match {
				continue
			}
		}
		copyItem := item
		copyItem.Suggested = isSuggested
		if isSuggested {
			suggested = append(suggested, copyItem)
		} else {
			rest = append(rest, copyItem)
		}
		if len(suggested)+len(rest) >= limit*3 {
			// keep scanning a bit more for better suggested set; break later
			if len(suggested) >= limit {
				break
			}
		}
	}
	sortNBSByPrefixSpecificity(suggested, prefixes)
	out := make([]NBS, 0, limit)
	out = append(out, suggested...)
	if !suggestedOnly {
		out = append(out, rest...)
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (s *Store) SearchLC116(q string, cnaeHint string, nbsHint string, suggestedOnly bool, limit int) []LC116 {
	if limit <= 0 {
		limit = 40
	}
	suggestedCodes := s.suggestedLC116(cnaeHint, nbsHint)
	suggestedSet := map[string]struct{}{}
	for _, code := range suggestedCodes {
		suggestedSet[normalizeLC116Code(code)] = struct{}{}
	}
	qNorm := normalize(q)
	qDigits := onlyDigits(q)

	var suggested, rest []LC116
	for _, item := range s.LC116 {
		code := normalizeLC116Code(item.Code)
		_, isSuggested := suggestedSet[code]
		if suggestedOnly && !isSuggested {
			continue
		}
		if qNorm != "" || qDigits != "" {
			match := false
			if qDigits != "" && (strings.HasPrefix(onlyDigits(code), qDigits) || strings.Contains(code, q)) {
				match = true
			}
			if !match && qNorm != "" && strings.Contains(normalize(item.Description), qNorm) {
				match = true
			}
			if !match && qNorm != "" && strings.Contains(normalize(code), qNorm) {
				match = true
			}
			if !match {
				continue
			}
		}
		copyItem := item
		copyItem.Code = code
		copyItem.Suggested = isSuggested
		if isSuggested {
			suggested = append(suggested, copyItem)
		} else {
			rest = append(rest, copyItem)
		}
		if len(suggested)+len(rest) >= limit*3 {
			if len(suggested) >= limit {
				break
			}
		}
	}

	// Prefer hint order for suggested items when there is no search query.
	if qNorm == "" && qDigits == "" && len(suggestedCodes) > 0 {
		ordered := make([]LC116, 0, len(suggested))
		seen := map[string]struct{}{}
		for _, code := range suggestedCodes {
			norm := normalizeLC116Code(code)
			if item, ok := s.LookupLC116(norm); ok {
				item.Suggested = true
				ordered = append(ordered, item)
				seen[norm] = struct{}{}
			}
		}
		for _, item := range suggested {
			if _, ok := seen[item.Code]; ok {
				continue
			}
			ordered = append(ordered, item)
		}
		suggested = ordered
	}

	out := make([]LC116, 0, limit)
	out = append(out, suggested...)
	if !suggestedOnly {
		out = append(out, rest...)
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (s *Store) SearchMunicipalities(q, uf string, limit int) []Municipality {
	if limit <= 0 {
		limit = 30
	}
	uf = strings.ToUpper(strings.TrimSpace(uf))
	qNorm := normalize(q)
	qDigits := onlyDigits(q)
	var out []Municipality
	for _, item := range s.Municipalities {
		if uf != "" && item.UF != uf {
			continue
		}
		if qDigits != "" && strings.HasPrefix(item.Code, qDigits) {
			out = append(out, item)
		} else if qNorm != "" && strings.Contains(normalize(item.Name), qNorm) {
			out = append(out, item)
		} else if qNorm == "" && qDigits == "" {
			out = append(out, item)
		} else {
			continue
		}
		if len(out) >= limit {
			break
		}
	}
	return out
}

// NBSPrefixesForCNAE returns soft-suggested NBS chapter prefixes for a CNAE subclass.
func (s *Store) NBSPrefixesForCNAE(cnae string) []string {
	digits := onlyDigits(cnae)
	if len(digits) < 2 {
		return nil
	}
	div := digits[:2]
	return append([]string(nil), s.hints[div]...)
}

// LC116CodesForCNAE returns soft-suggested LC 116 item codes for a CNAE subclass.
func (s *Store) LC116CodesForCNAE(cnae string) []string {
	digits := onlyDigits(cnae)
	if len(digits) < 2 {
		return nil
	}
	div := digits[:2]
	return append([]string(nil), s.lc116Hints[div]...)
}

// LC116CodesForNBS returns LC 116 items correlated to an NBS code (Anexo VIII).
func (s *Store) LC116CodesForNBS(nbs string) []string {
	digits := onlyDigits(nbs)
	if digits == "" {
		return nil
	}
	if codes := s.lc116ByNBS[digits]; len(codes) > 0 {
		return append([]string(nil), codes...)
	}
	if len(digits) < 5 {
		return nil
	}
	prefix := digits[:5]
	seen := map[string]struct{}{}
	var out []string
	for k, codes := range s.lc116ByNBS {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		for _, code := range codes {
			norm := normalizeLC116Code(code)
			if _, ok := seen[norm]; ok {
				continue
			}
			seen[norm] = struct{}{}
			out = append(out, norm)
		}
	}
	sort.Strings(out)
	return out
}

func (s *Store) suggestedLC116(cnae, nbs string) []string {
	if codes := s.LC116CodesForNBS(nbs); len(codes) > 0 {
		return codes
	}
	return s.LC116CodesForCNAE(cnae)
}

func (s *Store) nbsDigitSetForLC116(code string) map[string]struct{} {
	code = normalizeLC116Code(code)
	if code == "" {
		return nil
	}
	digitsList := s.nbsByLC116[code]
	if len(digitsList) == 0 {
		return nil
	}
	out := make(map[string]struct{}, len(digitsList))
	for _, d := range digitsList {
		out[d] = struct{}{}
	}
	return out
}

func nbsSuggested(item NBS, prefixes []string, lc116Digits map[string]struct{}) bool {
	if len(lc116Digits) > 0 {
		_, ok := lc116Digits[item.CodeDigits]
		return ok
	}
	return matchesAnyPrefix(item.Code, prefixes)
}

func matchesAnyPrefix(code string, prefixes []string) bool {
	if len(prefixes) == 0 {
		return false
	}
	for _, p := range prefixes {
		if p != "" && strings.HasPrefix(code, p) {
			return true
		}
	}
	return false
}

func prefixRank(code string, prefixes []string) (length int, idx int) {
	idx = len(prefixes) + 1
	for i, p := range prefixes {
		if p == "" || !strings.HasPrefix(code, p) {
			continue
		}
		if len(p) > length || (len(p) == length && i < idx) {
			length = len(p)
			idx = i
		}
	}
	return
}

// sortNBSByPrefixSpecificity prefers the longest hint prefix, then hint order.
func sortNBSByPrefixSpecificity(items []NBS, prefixes []string) {
	if len(items) < 2 || len(prefixes) == 0 {
		return
	}
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			li, ii := prefixRank(items[i].Code, prefixes)
			lj, jj := prefixRank(items[j].Code, prefixes)
			if lj > li || (lj == li && jj < ii) || (lj == li && jj == ii && items[j].Code < items[i].Code) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
}

func normalizeLC116Code(code string) string {
	code = strings.TrimSpace(code)
	digits := onlyDigits(code)
	if len(digits) == 4 {
		return digits[:2] + "." + digits[2:]
	}
	if strings.Contains(code, ".") {
		parts := strings.Split(code, ".")
		if len(parts) >= 2 {
			a := onlyDigits(parts[0])
			b := onlyDigits(parts[1])
			if len(a) > 0 && len(b) > 0 {
				if len(a) == 1 {
					a = "0" + a
				}
				if len(b) == 1 {
					b = "0" + b
				}
				return a + "." + b
			}
		}
	}
	return code
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

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case 'á', 'à', 'ã', 'â', 'ä':
			b.WriteByte('a')
		case 'é', 'ê', 'è', 'ë':
			b.WriteByte('e')
		case 'í', 'ì', 'î', 'ï':
			b.WriteByte('i')
		case 'ó', 'ò', 'õ', 'ô', 'ö':
			b.WriteByte('o')
		case 'ú', 'ù', 'û', 'ü':
			b.WriteByte('u')
		case 'ç':
			b.WriteByte('c')
		default:
			if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
