package fiscal

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/danfse"
)

func TestLooksLikeNFSeXML(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		data string
		want bool
	}{
		{name: "empty", data: "", want: false},
		{name: "json", data: `{"nfseXmlGZipB64":"..."}`, want: false},
		{name: "nfse root", data: `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS1"/></NFSe>`, want: true},
		{name: "prefixed", data: `<ns2:NFSe><ns2:infNFSe Id="x"/></ns2:NFSe>`, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := looksLikeNFSeXML([]byte(tc.data)); got != tc.want {
				t.Fatalf("looksLikeNFSeXML(%q)=%v want %v", tc.data, got, tc.want)
			}
		})
	}
}

func TestDanfseRender_QASVersusPRDWatermark(t *testing.T) {
	t.Parallel()
	prodXML, err := os.ReadFile(danfseMockXMLPath(t))
	if err != nil {
		t.Fatal(err)
	}
	renderer := danfse.NewDanfseRenderer()

	prodPDF, err := renderer.Render(prodXML)
	if err != nil {
		t.Fatalf("render production (tpAmb=1 / PRD-like): %v", err)
	}
	if len(prodPDF) < 5 || string(prodPDF[:5]) != "%PDF-" {
		t.Fatal("production PDF missing magic header")
	}

	homologXML := []byte(strings.Replace(string(prodXML), "<tpAmb>1</tpAmb>", "<tpAmb>2</tpAmb>", 1))
	homologPDF, err := renderer.Render(homologXML)
	if err != nil {
		t.Fatalf("render homologacao (tpAmb=2 / QAS-like): %v", err)
	}
	if len(homologPDF) < 5 || string(homologPDF[:5]) != "%PDF-" {
		t.Fatal("homologacao PDF missing magic header")
	}

	// Homologação adds the red "SEM VALIDADE JURÍDICA" stream — sizes must differ.
	if len(homologPDF) == len(prodPDF) {
		t.Fatalf("expected QAS (tpAmb=2) PDF to differ from PRD (tpAmb=1); both %d bytes", len(prodPDF))
	}
}

func danfseMockXMLPath(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Join(filepath.Dir(file), "..", "platform", "danfse", "testdata", "mock_danfse.xml")
}
