package danfe

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func loadFixture(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/nfe_rtc.xml")
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// writeArtifact keeps the PDF for visual review when DANFE_OUT is set.
func writeArtifact(t *testing.T, name string, pdf []byte) {
	t.Helper()
	dir := os.Getenv("DANFE_OUT")
	if dir == "" {
		return
	}
	if err := os.WriteFile(filepath.Join(dir, name), pdf, 0o644); err != nil {
		t.Fatal(err)
	}
}

var pageObj = regexp.MustCompile(`/Type /Page\b`)

func pageCount(pdf []byte) int {
	return len(pageObj.FindAll(pdf, -1))
}

func TestParseXML_FieldsOfNT(t *testing.T) {
	n, err := ParseXML(loadFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	if got := n.AccessKey(); got != "42261013677964000200550020000693421415071225" {
		t.Fatalf("access key = %q", got)
	}
	if n.InfNFe.Emit.CRT != "3" || n.Prot.NProt != "342260000123456" {
		t.Fatalf("emit/prot not parsed: %+v %+v", n.InfNFe.Emit, n.Prot)
	}
	tot := n.InfNFe.Total.IBSCBSTot
	if tot == nil || tot.GCBS.VCBS != "669.15" || tot.GIBS.GIBSUF.VIBSUF != "74.35" {
		t.Fatalf("IBSCBSTot not parsed: %+v", tot)
	}
	if n.InfNFe.Total.ISTot != nil {
		t.Fatal("ISTot must stay nil when absent")
	}

	item := buildItem(n.InfNFe.Det[0])
	if item.CST != "000" || item.CFOP != "5102" {
		t.Fatalf("CST/CFOP = %q/%q", item.CST, item.CFOP)
	}
	// gRed present: prints pAliqEfet, not the nominal rate.
	if got := item.Rates[0][1].Value; got != "0,36%" {
		t.Fatalf("CBS rate = %q, want effective 0,36%%", got)
	}
	if got := item.Rates[1][0].Value; got != "0,04%" {
		t.Fatalf("IBS UF rate = %q, want effective 0,04%%", got)
	}
	// No IS group: value stays blank instead of 0,00.
	if got := item.Values[2][1].Value; got != "" {
		t.Fatalf("IS value = %q, want blank", got)
	}
	if !strings.Contains(strings.Join(item.Description, " "), "[cClassTrib 200001]") {
		t.Fatalf("description misses cClassTrib: %v", item.Description)
	}

	item2 := buildItem(n.InfNFe.Det[1])
	if got := item2.Rates[0][1].Value; got != "0,90%" {
		t.Fatalf("CBS nominal rate = %q", got)
	}
	if got := item2.Bases[3].Value; got != "" {
		t.Fatalf("IPI base without IPI group = %q, want blank", got)
	}
}

func TestParseXML_RejectsNFCe(t *testing.T) {
	xml := strings.Replace(string(loadFixture(t)), "<mod>55</mod>", "<mod>65</mod>", 1)
	if _, err := ParseXML([]byte(xml)); err == nil {
		t.Fatal("NFC-e must be rejected")
	}
}

func TestParseXML_BareNFe(t *testing.T) {
	raw := string(loadFixture(t))
	start := strings.Index(raw, "<NFe>")
	end := strings.Index(raw, "</NFe>") + len("</NFe>")
	bare := `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">` + raw[start+len("<NFe>"):end]
	n, err := ParseXML([]byte(bare))
	if err != nil {
		t.Fatal(err)
	}
	if n.AccessKey() == "" || n.Prot.NProt != "" {
		t.Fatalf("bare NFe: key=%q prot=%q", n.AccessKey(), n.Prot.NProt)
	}
}

func TestRender_BothOrientations(t *testing.T) {
	data := loadFixture(t)
	for _, o := range []Orientation{Portrait, Landscape} {
		pdf, err := NewRenderer().Render(data, RenderOptions{Orientation: o})
		if err != nil {
			t.Fatalf("%s: %v", o, err)
		}
		if !bytes.HasPrefix(pdf, []byte("%PDF")) {
			t.Fatalf("%s: not a PDF", o)
		}
		if got := pageCount(pdf); got != 1 {
			t.Fatalf("%s: pages = %d, want 1", o, got)
		}
		writeArtifact(t, "danfe-"+o.String()+".pdf", pdf)
	}
}

func TestRender_PaginatesManyItems(t *testing.T) {
	raw := string(loadFixture(t))
	start := strings.Index(raw, `<det nItem="2">`)
	end := strings.Index(raw, "<total>")
	det := raw[start:end]
	var b strings.Builder
	for i := 0; i < 60; i++ {
		b.WriteString(det)
	}
	many := raw[:start] + b.String() + raw[end:]
	for _, o := range []Orientation{Portrait, Landscape} {
		pdf, err := NewRenderer().Render([]byte(many), RenderOptions{Orientation: o})
		if err != nil {
			t.Fatalf("%s: %v", o, err)
		}
		if got := pageCount(pdf); got < 2 {
			t.Fatalf("%s: pages = %d, want several", o, got)
		}
		writeArtifact(t, "danfe-"+o.String()+"-multi.pdf", pdf)
	}
}

func TestRender_LogoAndCancelled(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 300, 120))
	for x := 0; x < 300; x++ {
		for y := 0; y < 120; y++ {
			img.Set(x, y, color.RGBA{R: 200, G: 30, B: 30, A: 255})
		}
	}
	var logo bytes.Buffer
	if err := png.Encode(&logo, img); err != nil {
		t.Fatal(err)
	}
	pdf, err := NewRenderer().Render(loadFixture(t), RenderOptions{Logo: logo.Bytes(), Cancelled: true})
	if err != nil {
		t.Fatal(err)
	}
	writeArtifact(t, "danfe-retrato-logo-cancelada.pdf", pdf)

	if _, err := NewRenderer().Render(loadFixture(t), RenderOptions{Logo: []byte("not-an-image")}); err == nil {
		t.Fatal("invalid logo must fail")
	}
}

func TestFormatDecimal(t *testing.T) {
	cases := []struct {
		in       string
		min, max int
		want     string
	}{
		{"185000.00", 2, 2, "185.000,00"},
		{"87.5000000000", 2, 10, "87,50"},
		{"0.0400", 2, 4, "0,04"},
		{"1.2345", 2, 4, "1,2345"},
		{"", 2, 2, ""},
		{"-12.5", 2, 2, "-12,50"},
	}
	for _, c := range cases {
		if got := formatDecimal(c.in, c.min, c.max); got != c.want {
			t.Errorf("formatDecimal(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
