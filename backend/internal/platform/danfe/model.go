package danfe

import "strings"

// taxLine is one "LABEL....value" entry of the item tax columns.
type taxLine struct {
	Label string
	Value string
}

// itemView is what the "Dados dos Produtos/Serviços" grid prints per item
// (NT 2026.010 item 4.3).
type itemView struct {
	Description []string // xProd, infAdProd, códigos
	CST         string
	CFOP        string
	Qty         string
	Unit        string
	UnitValue   string
	Total       string
	Bases       []taxLine
	Rates       [][2]taxLine
	Values      [][2]taxLine
}

func buildItem(d Det) itemView {
	icms := d.Imposto.icms()
	var ipi IPITrib
	if d.Imposto.IPI != nil && d.Imposto.IPI.Trib != nil {
		ipi = *d.Imposto.IPI.Trib
	}
	var is IS
	if d.Imposto.IS != nil {
		is = *d.Imposto.IS
	}
	var g GIBSCBS
	cClassTrib := ""
	if d.Imposto.IBSCBS != nil {
		cClassTrib = d.Imposto.IBSCBS.CClassTrib
		if d.Imposto.IBSCBS.G != nil {
			g = *d.Imposto.IBSCBS.G
		}
	}

	desc := []string{strings.TrimSpace(d.Prod.XProd)}
	if a := strings.TrimSpace(d.InfAdProd); a != "" {
		desc = append(desc, a)
	}
	var codes []string
	if c := strings.TrimSpace(d.Prod.CProd); c != "" {
		codes = append(codes, "[Cód. "+c+"]")
	}
	if n := strings.TrimSpace(d.Prod.NCM); n != "" {
		codes = append(codes, "[NCM "+n+"]")
	}
	if c := strings.TrimSpace(cClassTrib); c != "" {
		codes = append(codes, "[cClassTrib "+c+"]")
	}
	if len(codes) > 0 {
		desc = append(desc, strings.Join(codes, " "))
	}

	return itemView{
		Description: desc,
		CST:         icms.cstCSOSN(),
		CFOP:        strings.TrimSpace(d.Prod.CFOP),
		Qty:         qty(d.Prod.QCom),
		Unit:        strings.TrimSpace(d.Prod.UCom),
		UnitValue:   unitValue(d.Prod.VUnCom),
		Total:       money(d.Prod.VProd),
		Bases: []taxLine{
			{"ICMS", money(icms.VBC)},
			{"IBS / CBS", money(g.VBC)},
			{"IS", money(is.VBCIS)},
			{"IPI", money(ipi.VBC)},
		},
		Rates: [][2]taxLine{
			{{"ICMS", percent(icms.PICMS)}, {"CBS", percent(g.GCBS.effective(g.GCBS.PCBS))}},
			{{"IBS UF", percent(g.GIBSUF.effective(g.GIBSUF.PIBSUF))}, {"IPI", percent(ipi.PIPI)}},
			{{"IBS MUN", percent(g.GIBSMn.effective(g.GIBSMn.PIBSMun))}, {"IS", percent(is.PIS)}},
		},
		Values: [][2]taxLine{
			{{"ICMS", money(icms.VICMS)}, {"CBS", money(g.GCBS.VCBS)}},
			{{"IBS UF", money(g.GIBSUF.VIBSUF)}, {"IPI", money(ipi.VIPI)}},
			{{"IBS MUN", money(g.GIBSMn.VIBSMun)}, {"IS", money(is.VIS)}},
		},
	}
}
