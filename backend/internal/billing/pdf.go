package billing

import (
	"bytes"
	"fmt"

	"github.com/go-pdf/fpdf"
)

// Brand colors from https://novaconsulting.com.br/
var (
	novaGold  = [3]int{241, 193, 73}  // #f1c149
	novaInk   = [3]int{54, 52, 43}    // #36342b
	novaCream = [3]int{253, 247, 231} // #fdf7e7
	novaMuted = [3]int{110, 106, 92}
)

func (s *Service) RenderPDF(stmt *Statement) ([]byte, string, error) {
	return renderPDF(stmt)
}

func renderPDF(stmt *Statement) ([]byte, string, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	const headerH = 26.0
	const left, right = 18.0, 18.0
	pdf.SetMargins(left, headerH+8, right)
	pdf.SetAutoPageBreak(true, 22)
	tr := pdf.UnicodeTranslatorFromDescriptor("")

	pageW, pageH := pdf.GetPageSize()
	contentW := pageW - left - right

	pdf.RegisterImageOptionsReader("nova", fpdf.ImageOptions{ImageType: "JPG"}, bytes.NewReader(novaLogoJPG))
	pdf.RegisterImageOptionsReader("nexus", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(nexusMarkPNG()))

	pdf.SetHeaderFunc(func() {
		setFill(pdf, novaGold)
		pdf.Rect(0, 0, pageW, headerH, "F")

		novaH, nexusH := 13.5, 12.0
		novaW, nexusW := 50.0, 12.0
		if info := pdf.GetImageInfo("nova"); info != nil && info.Height() > 0 {
			novaW = novaH * info.Width() / info.Height()
		}
		if info := pdf.GetImageInfo("nexus"); info != nil && info.Height() > 0 {
			nexusW = nexusH * info.Width() / info.Height()
		}
		pdf.ImageOptions("nova", left, (headerH-novaH)/2, novaW, novaH, false, fpdf.ImageOptions{ImageType: "JPG"}, 0, "")
		pdf.ImageOptions("nexus", pageW-right-nexusW, (headerH-nexusH)/2, nexusW, nexusH, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	})

	pdf.SetFooterFunc(func() {
		pdf.SetY(-16)
		setDraw(pdf, novaGold)
		pdf.SetLineWidth(0.5)
		pdf.Line(left, pdf.GetY(), pageW-right, pdf.GetY())
		pdf.SetY(-14)
		pdf.SetFont("Helvetica", "", 7)
		setText(pdf, novaMuted)
		pdf.CellFormat(contentW*0.68, 5, tr("Nexus · Nova Consulting — extrato de consumo de mensageria. Valores unitários conforme contrato comercial."), "", 0, "L", false, 0, "")
		pdf.CellFormat(contentW*0.32, 5, fmt.Sprintf("Página %d de {nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.SetTitle("Extrato de Consumo de Mensageria", true)
	pdf.SetAuthor("Nova Consulting", true)
	pdf.AliasNbPages("")
	pdf.AddPage()

	issuer := stmt.Issuer
	pdf.SetFont("Helvetica", "B", 11)
	setText(pdf, novaInk)
	pdf.Cell(0, 5, tr(issuer.TradeName))
	pdf.Ln(5)
	pdf.SetFont("Helvetica", "", 8)
	pdf.Cell(0, 4, tr(issuer.LegalName))
	pdf.Ln(4)
	setText(pdf, novaMuted)
	pdf.Cell(0, 3.6, tr(issuer.Email+"  ·  "+issuer.Website))
	pdf.Ln(8)

	setDraw(pdf, novaGold)
	pdf.SetLineWidth(0.7)
	pdf.Line(left, pdf.GetY(), pageW-right, pdf.GetY())
	pdf.Ln(5)

	pdf.SetFont("Helvetica", "B", 14)
	setText(pdf, novaInk)
	pdf.Cell(0, 7, tr("Extrato de Consumo de Mensageria"))
	pdf.Ln(6)
	pdf.SetFont("Helvetica", "", 10)
	pdf.Cell(0, 5, tr("Produto "+issuer.ProductName+"  ·  Período "+FormatPeriodBR(stmt.PeriodFrom, stmt.PeriodTo)))
	pdf.Ln(5)
	pdf.SetFont("Helvetica", "", 8)
	setText(pdf, novaMuted)
	pdf.Cell(0, 4, tr("Emitido em "+FormatDateBR(stmt.IssuedAt)+"  ·  Unidade de medida: mensagem"))
	pdf.Ln(8)

	pdf.SetFont("Helvetica", "B", 9)
	setText(pdf, novaInk)
	pdf.Cell(0, 5, tr("Cliente (organização)"))
	pdf.Ln(5)
	pdf.SetFont("Helvetica", "", 9)
	pdf.Cell(0, 4.2, tr(stmt.LegalName))
	pdf.Ln(4.2)
	if stmt.TradeName != nil && *stmt.TradeName != "" && *stmt.TradeName != stmt.LegalName {
		pdf.Cell(0, 4.2, tr(*stmt.TradeName))
		pdf.Ln(4.2)
	}
	meta := "Slug: " + stmt.Slug
	if stmt.TaxIdentifier != nil && *stmt.TaxIdentifier != "" {
		meta += "  ·  CNPJ/ID: " + *stmt.TaxIdentifier
	}
	setText(pdf, novaMuted)
	pdf.Cell(0, 4.2, tr(meta))
	pdf.Ln(4.2)
	pdf.Cell(0, 4.2, tr("Organization ID: "+stmt.OrganizationID.String()))
	pdf.Ln(8)

	drawMetricTable(pdf, tr, contentW, "Consumo total", stmt.Totals, stmt.TotalQuantity)
	pdf.Ln(4)

	for _, company := range stmt.Companies {
		if pdf.GetY() > pageH-50 {
			pdf.AddPage()
		}
		title := company.LegalName
		if company.CNPJ != "" {
			title += "  ·  " + formatCNPJ(company.CNPJ)
		}
		drawMetricTable(pdf, tr, contentW, title, company.Metrics, company.TotalQuantity)
		pdf.Ln(3)
	}

	pdf.Ln(4)
	pdf.SetFont("Helvetica", "", 7.5)
	setText(pdf, novaMuted)
	pdf.MultiCell(contentW, 3.6, tr("Este extrato descreve o consumo de mensageria fiscal no período informado. Cada documento ou evento enviado/recebido pela plataforma conta como uma mensagem. O valor a faturar segue o contrato comercial vigente. Em caso de divergência, utilize o ID da organização como referência."), "", "L", false)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), statementFilename(stmt), nil
}

func drawMetricTable(pdf *fpdf.Fpdf, tr func(string) string, contentW float64, title string, metrics []MetricQuantity, total int64) {
	pdf.SetFont("Helvetica", "B", 9)
	setText(pdf, novaInk)
	pdf.Cell(0, 6, tr(title))
	pdf.Ln(6)

	colMetric := contentW * 0.62
	colUnit := contentW * 0.18
	colQty := contentW * 0.20

	setDraw(pdf, novaGold)
	pdf.SetLineWidth(0.2)
	setFill(pdf, novaInk)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(colMetric, 6, tr("Descrição"), "1", 0, "L", true, 0, "")
	pdf.CellFormat(colUnit, 6, tr("Unidade"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(colQty, 6, tr("Quantidade"), "1", 1, "R", true, 0, "")

	setText(pdf, novaInk)
	pdf.SetFont("Helvetica", "", 8)
	if len(metrics) == 0 {
		setFill(pdf, novaCream)
		pdf.CellFormat(contentW, 6, tr("Sem consumo no período."), "1", 1, "L", true, 0, "")
		return
	}
	fill := false
	for _, m := range metrics {
		if fill {
			setFill(pdf, novaCream)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}
		pdf.CellFormat(colMetric, 5.5, tr(m.Label), "1", 0, "L", true, 0, "")
		pdf.CellFormat(colUnit, 5.5, tr(m.Unit), "1", 0, "C", true, 0, "")
		pdf.CellFormat(colQty, 5.5, formatIntBR(m.Quantity), "1", 1, "R", true, 0, "")
		fill = !fill
	}
	setFill(pdf, novaGold)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(colMetric, 6, tr("Total"), "1", 0, "L", true, 0, "")
	pdf.CellFormat(colUnit, 6, tr("mensagem"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(colQty, 6, formatIntBR(total), "1", 1, "R", true, 0, "")
}

func setFill(pdf *fpdf.Fpdf, c [3]int) {
	pdf.SetFillColor(c[0], c[1], c[2])
}

func setDraw(pdf *fpdf.Fpdf, c [3]int) {
	pdf.SetDrawColor(c[0], c[1], c[2])
}

func setText(pdf *fpdf.Fpdf, c [3]int) {
	pdf.SetTextColor(c[0], c[1], c[2])
}

func formatIntBR(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprintf("%d", n)
	var out []byte
	for i, c := range reverseASCII(s) {
		if i > 0 && i%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, byte(c))
	}
	res := reverseASCII(string(out))
	if neg {
		return "-" + res
	}
	return res
}

func reverseASCII(s string) string {
	b := []byte(s)
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
	return string(b)
}

func formatCNPJ(value string) string {
	digits := make([]byte, 0, 14)
	for i := 0; i < len(value); i++ {
		c := value[i]
		if c >= '0' && c <= '9' {
			digits = append(digits, c)
		}
	}
	if len(digits) != 14 {
		return value
	}
	return string(digits[0:2]) + "." + string(digits[2:5]) + "." + string(digits[5:8]) + "/" + string(digits[8:12]) + "-" + string(digits[12:14])
}
