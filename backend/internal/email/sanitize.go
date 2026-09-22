package email

import (
	"regexp"
	"strings"
)

var allowedTagPattern = regexp.MustCompile(`</?(?:p|br|b|strong|i|em|u|ul|ol|li|div|span)(?:\s[^>]*)?/?>`)

// SanitizeHTML strips unknown tags while keeping basic formatting from the editor.
func SanitizeHTML(html string) string {
	html = strings.TrimSpace(html)
	if html == "" {
		return ""
	}
	html = regexp.MustCompile(`(?i)<(script|style)[^>]*>[\s\S]*?</(script|style)>`).ReplaceAllString(html, "")
	// Strip all tags not in allowlist.
	var out strings.Builder
	remaining := html
	for {
		idx := strings.Index(remaining, "<")
		if idx < 0 {
			out.WriteString(remaining)
			break
		}
		out.WriteString(remaining[:idx])
		remaining = remaining[idx:]
		end := strings.Index(remaining, ">")
		if end < 0 {
			out.WriteString(remaining)
			break
		}
		tag := remaining[:end+1]
		if allowedTagPattern.MatchString(tag) {
			out.WriteString(tag)
		}
		remaining = remaining[end+1:]
	}
	return out.String()
}

func HTMLToPlain(html string) string {
	s := regexp.MustCompile(`(?i)<br\s*/?>`).ReplaceAllString(html, "\n")
	s = regexp.MustCompile(`(?i)</p>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	return strings.TrimSpace(s)
}
