package danfse

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFormatters_PortalAlignment(t *testing.T) {
	assert.Equal(t, "06/09/2026", formatDateBR("2026-09-06"))
	assert.Equal(t, "06/09/2026 23:40:03", formatDateTimeBR("2026-09-06T23:40:03-03:00"))
	assert.Equal(t, "1.1501.10.00", formatNBS("115011000"))
	assert.Equal(t, "41.06902", formatIBGE("4106902"))
	assert.Equal(t, "000 / 000001", formatCSTClass("000", "000001"))
	assert.Equal(t, "R$ 5,00", sumCurrency("0.50", "4.50"))
	assert.Equal(t, "Prestador", formatTpEmit("1"))
	assert.Equal(t, "NFS-e Gerada", formatCStat("100"))
	assert.Equal(t, "NFS-e regular", formatFinNFSe("0"))
	assert.Equal(t, "01.06.01 / -", formatTribNacMun("010601", ""))
	assert.Equal(t, "0,10 % / 0,00 %", formatPercentPair("0.10", "0.00"))
	assert.Equal(t, "R$ 0,00", sumExclusoes("", "", ""))
}
