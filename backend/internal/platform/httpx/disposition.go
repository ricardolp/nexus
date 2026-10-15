package httpx

import (
	"fmt"
	"strings"
)

// AttachmentDisposition builds a Content-Disposition header carrying both the
// ASCII filename and the RFC 5987 filename* (UTF-8), so browsers keep accents.
func AttachmentDisposition(filename string) string {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "download"
	}
	var ascii strings.Builder
	for _, r := range filename {
		switch {
		case r == '"' || r == '\\' || r < 0x20 || r > 0x7e:
			ascii.WriteByte('_')
		default:
			ascii.WriteRune(r)
		}
	}
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii.String(), encodeRFC5987(filename))
}

func encodeRFC5987(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if isAttrChar(c) {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}

func isAttrChar(c byte) bool {
	switch {
	case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		return true
	}
	return strings.IndexByte("!#$&+-.^_`|~", c) >= 0
}
