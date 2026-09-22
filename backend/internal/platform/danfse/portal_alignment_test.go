package danfse_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/nexus/fiscal-messaging/internal/platform/danfse"
)

func TestParseXML_AuthorizedIBSCBS(t *testing.T) {
	xmlData, err := os.ReadFile("testdata/mock_danfse_authorized_ibscbs.xml")
	require.NoError(t, err)

	nfse, err := danfse.ParseXML(xmlData)
	require.NoError(t, err)

	assert.Equal(t, "100", nfse.InfNFSe.CStat)
	assert.Equal(t, "1", nfse.InfNFSe.DPS.InfDPS.TpEmit)
	assert.Equal(t, "0", nfse.InfNFSe.DPS.InfDPS.IBSCBS.FinNFSe)
	assert.Equal(t, "000", nfse.InfNFSe.DPS.InfDPS.IBSCBS.Valores.Trib.GIBSCBS.CST)
	assert.Equal(t, "000001", nfse.InfNFSe.DPS.InfDPS.IBSCBS.Valores.Trib.GIBSCBS.CClassTrib)
	assert.Equal(t, "500.00", nfse.InfNFSe.IBSCBS.Valores.VBC)
	assert.Equal(t, "0.50", nfse.InfNFSe.IBSCBS.TotCIBS.GIBS.VIBSTot)
	assert.Equal(t, "4.50", nfse.InfNFSe.IBSCBS.TotCIBS.GCBS.VCBS)
	assert.Equal(t, "0.10", nfse.InfNFSe.IBSCBS.Valores.UF.PIBSUF)
	assert.Equal(t, "4106902", nfse.InfNFSe.IBSCBS.CLocalidadeIncid)
}

func TestRenderer_AuthorizedIBSCBS_FillsPortalFields(t *testing.T) {
	text := pdfTextFromFile(t, "testdata/mock_danfse_authorized_ibscbs.xml")
	assert.Contains(t, text, "Prestador")
	assert.Contains(t, text, "NFS-e Gerada")
	assert.Contains(t, text, "NFS-e regular")
	assert.Contains(t, text, "06/09/2026")
	assert.Contains(t, text, "1.1501.10.00")
	assert.Contains(t, text, "000 / 000001")
	assert.Contains(t, text, "R$ 0,50")
	assert.Contains(t, text, "R$ 4,50")
	assert.Contains(t, text, "R$ 5,00")
	assert.Contains(t, text, "Curitiba")
	assert.Contains(t, text, "12.741")
	assert.NotContains(t, text, "1 - Normal")
}

func TestRenderer_CancelledWatermark(t *testing.T) {
	xmlData, err := os.ReadFile("testdata/mock_danfse_authorized_ibscbs.xml")
	require.NoError(t, err)
	text := pdfTextWithOpts(t, xmlData, danfse.RenderOptions{Cancelled: true})
	assert.Contains(t, text, "CANCELADA")
	assert.Contains(t, text, "NFS-e Gerada")
}

func TestRenderer_SubstitutedWatermark(t *testing.T) {
	xmlData, err := os.ReadFile("testdata/mock_danfse_authorized_ibscbs.xml")
	require.NoError(t, err)
	text := pdfTextWithOpts(t, xmlData, danfse.RenderOptions{Substituted: true})
	assert.Contains(t, text, "SUBSTITUÍDA")
}

func TestRenderer_AuthorizedIBSCBS_RendersWithoutError(t *testing.T) {
	xmlData, err := os.ReadFile("testdata/mock_danfse_authorized_ibscbs.xml")
	require.NoError(t, err)
	pdf, err := danfse.NewDanfseRenderer().Render(xmlData, danfse.RenderOptions{Cancelled: true})
	require.NoError(t, err)
	require.Greater(t, len(pdf), 1000)
	require.True(t, bytesHasPDFHeader(pdf))
}

func bytesHasPDFHeader(pdf []byte) bool {
	return len(pdf) > 4 && string(pdf[:5]) == "%PDF-"
}

func pdfTextFromFile(t *testing.T, path string) string {
	t.Helper()
	xmlData, err := os.ReadFile(path)
	require.NoError(t, err)
	return pdfTextWithOpts(t, xmlData)
}

func pdfTextWithOpts(t *testing.T, xmlData []byte, opts ...danfse.RenderOptions) string {
	t.Helper()
	if _, err := exec.LookPath("pdftotext"); err != nil {
		t.Skip("pdftotext indisponível")
	}
	pdf, err := danfse.NewDanfseRenderer().Render(xmlData, opts...)
	require.NoError(t, err)
	dir := t.TempDir()
	in := filepath.Join(dir, "danfse.pdf")
	out := filepath.Join(dir, "danfse.txt")
	require.NoError(t, os.WriteFile(in, pdf, 0o644))
	cmd := exec.Command("pdftotext", "-layout", in, out)
	require.NoError(t, cmd.Run())
	b, err := os.ReadFile(out)
	require.NoError(t, err)
	return string(b)
}
