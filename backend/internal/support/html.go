package support

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	scriptTag = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`)
	styleTag  = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`)
	htmlTag   = regexp.MustCompile(`(?s)<[^>]+>`)
)

func StripHTML(html string) string {
	s := scriptTag.ReplaceAllString(html, " ")
	s = styleTag.ReplaceAllString(s, " ")
	s = htmlTag.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", `"`)
	fields := strings.FieldsFunc(s, func(r rune) bool {
		return unicode.IsSpace(r)
	})
	return strings.Join(fields, " ")
}
