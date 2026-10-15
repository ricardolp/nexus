package httpx

import "testing"

func TestAttachmentDisposition(t *testing.T) {
	cases := map[string]string{
		"NFe123-danfe-retrato.pdf": `attachment; filename="NFe123-danfe-retrato.pdf"; filename*=UTF-8''NFe123-danfe-retrato.pdf`,
		`notas "fiscais".zip`:      `attachment; filename="notas _fiscais_.zip"; filename*=UTF-8''notas%20%22fiscais%22.zip`,
		"emissão.xml":              `attachment; filename="emiss_o.xml"; filename*=UTF-8''emiss%C3%A3o.xml`,
		"":                         `attachment; filename="download"; filename*=UTF-8''download`,
	}
	for in, want := range cases {
		if got := AttachmentDisposition(in); got != want {
			t.Fatalf("%q:\n got %s\nwant %s", in, got, want)
		}
	}
}
