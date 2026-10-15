// Package danfe renders the DANFE (model 55) from the authorized NF-e XML,
// following the reference layouts of NT 2026.010 (Reforma Tributária):
// portrait is the main layout, landscape the alternative one.
package danfe

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	_ "image/png"
	"strings"

	"github.com/boombuler/barcode/code128"
	"github.com/nexus/fiscal-messaging/internal/platform/danfse"
	"github.com/signintech/gopdf"
	"github.com/skip2/go-qrcode"
)

type Orientation int

const (
	Portrait Orientation = iota
	Landscape
)

func (o Orientation) String() string {
	if o == Landscape {
		return "paisagem"
	}
	return "retrato"
}

// RenderOptions carries what is not in the authorized XML: the cancel event
// and the company mark printed in the issuer box.
type RenderOptions struct {
	Orientation Orientation
	Cancelled   bool
	Logo        []byte
}

type Renderer interface {
	Render(xmlData []byte, opts RenderOptions) ([]byte, error)
}

type renderer struct {
	fontReg  []byte
	fontBold []byte
}

func NewRenderer() Renderer {
	reg, bold := danfse.EmbeddedFonts()
	return &renderer{fontReg: reg, fontBold: bold}
}

const (
	fontR = "LiberationSans"
	fontB = "LiberationSans-Bold"

	cmPt = 28.34645669

	margin   = 14.0
	fieldH   = 20.0
	titleH   = 9.0
	itemLine = 6.4
	itemFont = 5.5

	// Logo slot inside the issuer box (3,20 cm × 2,20 cm).
	LogoMaxWidthCm  = 3.20
	LogoMaxHeightCm = 2.20

	maxDescLines = 14
)

func (r *renderer) Render(xmlData []byte, opts RenderOptions) ([]byte, error) {
	n, err := ParseXML(xmlData)
	if err != nil {
		return nil, fmt.Errorf("danfe: falha ao ler xml: %w", err)
	}
	if len(opts.Logo) > 0 {
		if _, _, err := image.DecodeConfig(bytes.NewReader(opts.Logo)); err != nil {
			return nil, fmt.Errorf("danfe: logo ilegível: %w", err)
		}
	}
	// The sheet count ("FOLHA x/y") is only known after paginating the items,
	// so the first pass just counts pages.
	_, pages, err := r.build(n, opts, 0)
	if err != nil {
		return nil, err
	}
	pdf, _, err := r.build(n, opts, pages)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if _, err := pdf.WriteTo(&buf); err != nil {
		return nil, fmt.Errorf("danfe: erro ao renderizar: %w", err)
	}
	return buf.Bytes(), nil
}

type layout struct {
	pageW, pageH float64
	left, right  float64
	top, bottom  float64
	// landscape keeps the receipt (canhoto) as a vertical strip on the left.
	stripX, stripW float64
	adicH          float64
	itemCols       []float64
}

func newLayout(o Orientation) layout {
	if o == Landscape {
		return layout{
			pageW: gopdf.PageSizeA4Landscape.W, pageH: gopdf.PageSizeA4Landscape.H,
			stripX: margin, stripW: 40,
			left: margin + 44, right: gopdf.PageSizeA4Landscape.W - margin,
			top: margin, bottom: gopdf.PageSizeA4Landscape.H - margin,
			adicH:    62,
			itemCols: []float64{250, 44, 56, 62, 64, 82, 104, 118},
		}
	}
	return layout{
		pageW: gopdf.PageSizeA4.W, pageH: gopdf.PageSizeA4.H,
		left: margin, right: gopdf.PageSizeA4.W - margin,
		top: margin, bottom: gopdf.PageSizeA4.H - margin,
		adicH:    78,
		itemCols: []float64{128, 36, 40, 46, 48, 70, 94, 105},
	}
}

func (l layout) width() float64 { return l.right - l.left }

type drawer struct {
	pdf        *gopdf.GoPdf
	l          layout
	n          *NFe
	opt        RenderOptions
	y          float64
	page       int
	totalPages int
}

func (r *renderer) build(n *NFe, opt RenderOptions, totalPages int) (*gopdf.GoPdf, int, error) {
	l := newLayout(opt.Orientation)
	pdf := &gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: gopdf.Rect{W: l.pageW, H: l.pageH}})
	if err := pdf.AddTTFFontByReader(fontR, bytes.NewReader(r.fontReg)); err != nil {
		return nil, 0, fmt.Errorf("danfe: fonte regular: %w", err)
	}
	if err := pdf.AddTTFFontByReader(fontB, bytes.NewReader(r.fontBold)); err != nil {
		return nil, 0, fmt.Errorf("danfe: fonte negrito: %w", err)
	}
	d := &drawer{pdf: pdf, l: l, n: n, opt: opt, totalPages: totalPages}

	items := make([]itemView, 0, len(n.InfNFe.Det))
	for _, det := range n.InfNFe.Det {
		items = append(items, buildItem(det))
	}

	if err := d.newPage(); err != nil {
		return nil, 0, err
	}
	d.drawDest()
	d.drawFatura()
	d.drawTotais()
	d.drawISSQN()
	d.drawTransp()

	adicTop := l.bottom - l.adicH - titleH
	next := d.drawItems(items, 0, adicTop-2)
	d.drawAdicionais(adicTop)

	for next < len(items) {
		if err := d.newPage(); err != nil {
			return nil, 0, err
		}
		before := next
		next = d.drawItems(items, next, l.bottom)
		if next == before {
			return nil, 0, fmt.Errorf("danfe: item %d não cabe na página", next+1)
		}
	}
	return pdf, d.page, nil
}

// newPage starts a sheet with the receipt (first sheet only), the issuer /
// DANFE / access-key block and the operation rows.
func (d *drawer) newPage() error {
	d.pdf.AddPage()
	d.page++
	d.y = d.l.top
	d.pdf.SetLineWidth(0.5)
	d.pdf.SetStrokeColor(0, 0, 0)
	d.drawWatermark()
	d.pdf.SetTextColor(0, 0, 0)
	if d.page == 1 {
		if d.opt.Orientation == Landscape {
			d.drawCanhotoStrip()
		} else {
			d.drawCanhoto(d.l.left, d.y, d.l.width(), 40)
			d.y += 44
			d.pdf.SetLineType("dashed")
			d.pdf.Line(d.l.left, d.y, d.l.right, d.y)
			d.pdf.SetLineType("solid")
			d.y += 5
		}
	}
	return d.drawIdent()
}

// drawWatermark goes first on the sheet so the fields print over it.
func (d *drawer) drawWatermark() {
	var marks []string
	if d.opt.Cancelled {
		marks = append(marks, "CANCELADA")
	}
	if strings.TrimSpace(d.n.InfNFe.Ide.TpAmb) == "2" {
		marks = append(marks, "SEM VALOR FISCAL")
	}
	if len(marks) == 0 {
		return
	}
	cx := (d.l.left + d.l.right) / 2
	cy := (d.l.top + d.l.bottom) / 2
	d.pdf.SetTextColor(205, 205, 205)
	d.pdf.Rotate(35, cx, cy)
	for i, m := range marks {
		size := 46.0
		if i > 0 {
			size = 30
		}
		_ = d.pdf.SetFont(fontB, "", size)
		tw, _ := d.pdf.MeasureTextWidth(m)
		d.pdf.SetX(cx - tw/2)
		d.pdf.SetY(cy - 30 + float64(i)*52)
		_ = d.pdf.Cell(nil, m)
	}
	d.pdf.RotateReset()
	d.pdf.SetTextColor(0, 0, 0)
}

// ---------------------------------------------------------------- primitives

const (
	alignLeft = iota
	alignRight
	alignCenter
)

func (d *drawer) rect(x, y, w, h float64) {
	d.pdf.RectFromUpperLeftWithStyle(x, y, w, h, "D")
}

func (d *drawer) setFont(bold bool, size float64) {
	if bold {
		_ = d.pdf.SetFont(fontB, "", size)
	} else {
		_ = d.pdf.SetFont(fontR, "", size)
	}
}

func (d *drawer) textWidth(s string) float64 {
	w, err := d.pdf.MeasureTextWidth(s)
	if err != nil {
		return 0
	}
	return w
}

// truncate shortens s with "..." to fit maxW in the current font.
func (d *drawer) truncate(s string, maxW float64) string {
	if s == "" || d.textWidth(s) <= maxW {
		return s
	}
	runes := []rune(s)
	lo, hi, best := 0, len(runes)-1, ""
	for lo <= hi {
		mid := (lo + hi) / 2
		cand := strings.TrimRight(string(runes[:mid]), " ") + "..."
		if d.textWidth(cand) <= maxW {
			best = cand
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return best
}

// text writes one line at (x, y top) inside maxW, truncating when needed.
func (d *drawer) text(x, y, maxW float64, s string, bold bool, size float64, align int) {
	if s == "" || maxW <= 0 {
		return
	}
	d.setFont(bold, size)
	s = d.truncate(s, maxW)
	w := d.textWidth(s)
	switch align {
	case alignRight:
		x += maxW - w
	case alignCenter:
		x += (maxW - w) / 2
	}
	d.pdf.SetX(x)
	d.pdf.SetY(y)
	_ = d.pdf.Cell(nil, s)
}

// wrap splits s into lines of at most maxW in the given font.
func (d *drawer) wrap(s string, maxW float64, bold bool, size float64) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	d.setFont(bold, size)
	var out []string
	for _, para := range strings.Split(s, "\n") {
		words := strings.Fields(para)
		line := ""
		for _, w := range words {
			cand := w
			if line != "" {
				cand = line + " " + w
			}
			if d.textWidth(cand) <= maxW {
				line = cand
				continue
			}
			if line != "" {
				out = append(out, line)
			}
			// A single word wider than the column is split by width.
			for d.textWidth(w) > maxW {
				parts, err := d.pdf.SplitText(w, maxW)
				if err != nil || len(parts) < 2 {
					break
				}
				out = append(out, parts[0])
				w = strings.Join(parts[1:], "")
			}
			line = w
		}
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

// clampLines keeps max lines, marking the cut with "..." on the last one.
func (d *drawer) clampLines(lines []string, max int, maxW float64, bold bool, size float64) []string {
	if len(lines) <= max {
		return lines
	}
	out := append([]string(nil), lines[:max]...)
	d.setFont(bold, size)
	last := out[max-1] + "..."
	if d.textWidth(last) > maxW {
		last = d.truncate(last, maxW)
	}
	out[max-1] = last
	return out
}

// label prints a field caption: one line at 5 pt, or two lines at 4.5 pt
// when the caption is wider than the box. Returns the height used.
func (d *drawer) label(x, y, w float64, s string) float64 {
	d.setFont(false, 5)
	if d.textWidth(s) <= w {
		d.text(x, y, w, s, false, 5, alignLeft)
		return 6
	}
	lines := d.wrap(s, w, false, 4.5)
	if len(lines) > 2 {
		lines = d.clampLines(lines, 2, w, false, 4.5)
	}
	for i, ln := range lines {
		d.text(x, y+float64(i)*5, w, ln, false, 4.5, alignLeft)
	}
	return float64(len(lines)) * 5
}

type cell struct {
	label string
	value string
	w     float64
	align int
	bold  bool
}

// row draws boxed fields across the content width, sized by weight.
func (d *drawer) row(cells []cell, h float64) {
	var total float64
	for _, c := range cells {
		total += c.w
	}
	x := d.l.left
	for _, c := range cells {
		cw := d.l.width() * c.w / total
		d.rect(x, d.y, cw, h)
		d.label(x+2, d.y+1.5, cw-4, c.label)
		size := 7.0
		d.text(x+2, d.y+h-size-2.5, cw-4, c.value, c.bold, size, c.align)
		x += cw
	}
	d.y += h
}

func (d *drawer) title(s string) {
	d.text(d.l.left, d.y+1.5, d.l.width(), s, true, 6, alignLeft)
	d.y += titleH
}

// --------------------------------------------------------------- receipt

func (d *drawer) drawCanhoto(x, y, w, h float64) {
	inf := d.n.InfNFe
	boxW := 92.0
	mainW := w - boxW
	half := h / 2

	d.rect(x, y, mainW, half)
	msg := "RECEBEMOS DE " + strings.ToUpper(strings.TrimSpace(inf.Emit.XNome)) +
		" OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO"
	lines := d.clampLines(d.wrap(msg, mainW-4, false, 5.5), 2, mainW-4, false, 5.5)
	for i, ln := range lines {
		d.text(x+2, y+2+float64(i)*6.5, mainW-4, ln, false, 5.5, alignLeft)
	}

	dataW := mainW * 0.28
	d.rect(x, y+half, dataW, half)
	d.label(x+2, y+half+1.5, dataW-4, "DATA DE RECEBIMENTO")
	d.rect(x+dataW, y+half, mainW-dataW, half)
	d.label(x+dataW+2, y+half+1.5, mainW-dataW-4, "IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR")

	bx := x + mainW
	d.rect(bx, y, boxW, h)
	d.text(bx, y+3, boxW, "NF-e", true, 10, alignCenter)
	d.text(bx, y+16, boxW, "Nº "+formatNumberNF(inf.Ide.NNF), true, 8, alignCenter)
	d.text(bx, y+27, boxW, "SÉRIE "+formatSerie(inf.Ide.Serie), true, 8, alignCenter)
}

// drawCanhotoStrip draws the receipt rotated on the left margin
// (landscape), reading bottom-up.
func (d *drawer) drawCanhotoStrip() {
	h := d.l.bottom - d.l.top
	w := d.l.stripW
	cx := d.l.stripX + w/2
	cy := d.l.top + h/2
	d.pdf.Rotate(90, cx, cy)
	d.drawCanhoto(cx-h/2, cy-w/2, h, w)
	d.pdf.RotateReset()
	d.pdf.SetLineType("dashed")
	x := d.l.stripX + w + 2
	d.pdf.Line(x, d.l.top, x, d.l.bottom)
	d.pdf.SetLineType("solid")
}

// ---------------------------------------------------------- identification

func (d *drawer) identWidths() (emitW, danfeW, keyW float64) {
	w := d.l.width()
	if d.opt.Orientation == Landscape {
		return w * 0.44, w * 0.15, w * 0.41
	}
	return w * 0.42, w * 0.17, w * 0.41
}

func (d *drawer) drawIdent() error {
	inf := d.n.InfNFe
	const h = 92.0
	x := d.l.left
	y := d.y
	emitW, danfeW, keyW := d.identWidths()

	// Issuer
	d.rect(x, y, emitW, h)
	tx, tw := x+4, emitW-8
	align := alignCenter
	if len(d.opt.Logo) > 0 {
		lw, err := d.drawLogo(x+4, y+4, h-8)
		if err != nil {
			return err
		}
		tx = x + 4 + lw + 5
		tw = emitW - (tx - x) - 4
		align = alignLeft
	}
	e := inf.Emit
	nameLines := d.clampLines(d.wrap(strings.TrimSpace(e.XNome), tw, true, 8.5), 3, tw, true, 8.5)
	addr := []string{
		joinNonEmpty(", ", e.Ender.XLgr, e.Ender.Nro) + func() string {
			if c := strings.TrimSpace(e.Ender.XCpl); c != "" {
				return " - " + c
			}
			return ""
		}(),
		joinNonEmpty(" - ", e.Ender.XBairro, formatCEP(e.Ender.CEP)),
		joinNonEmpty(" / ", e.Ender.XMun, e.Ender.UF),
	}
	if f := formatPhone(e.Ender.Fone); f != "" {
		addr = append(addr, "Fone: "+f)
	}
	var addrLines []string
	for _, a := range addr {
		addrLines = append(addrLines, d.clampLines(d.wrap(a, tw, false, 6.5), 2, tw, false, 6.5)...)
	}
	blockH := float64(len(nameLines))*10 + 3 + float64(len(addrLines))*8
	ty := y + (h-blockH)/2
	if ty < y+3 {
		ty = y + 3
	}
	for _, ln := range nameLines {
		d.text(tx, ty, tw, ln, true, 8.5, align)
		ty += 10
	}
	ty += 3
	for _, ln := range addrLines {
		d.text(tx, ty, tw, ln, false, 6.5, align)
		ty += 8
	}

	// DANFE box
	bx := x + emitW
	d.rect(bx, y, danfeW, h)
	d.text(bx, y+4, danfeW, "DANFE", true, 12, alignCenter)
	sub := d.wrap("DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA", danfeW-6, false, 5.5)
	sy := y + 19
	for _, ln := range sub {
		d.text(bx+3, sy, danfeW-6, ln, false, 5.5, alignCenter)
		sy += 6.5
	}
	sy += 2
	d.text(bx+6, sy, danfeW-30, "0 - ENTRADA", false, 6, alignLeft)
	d.text(bx+6, sy+8, danfeW-30, "1 - SAÍDA", false, 6, alignLeft)
	d.rect(bx+danfeW-20, sy, 13, 14)
	d.text(bx+danfeW-20, sy+2, 13, strings.TrimSpace(inf.Ide.TpNF), true, 10, alignCenter)
	sy += 19
	d.text(bx, sy, danfeW, "Nº "+formatNumberNF(inf.Ide.NNF), true, 7.5, alignCenter)
	d.text(bx, sy+9, danfeW, "SÉRIE "+formatSerie(inf.Ide.Serie), true, 7.5, alignCenter)
	folha := fmt.Sprintf("FOLHA %d/%d", d.page, d.totalPages)
	if d.totalPages == 0 {
		folha = fmt.Sprintf("FOLHA %d/%d", d.page, d.page)
	}
	d.text(bx, sy+18, danfeW, folha, true, 7.5, alignCenter)

	// Access key
	kx := bx + danfeW
	key := d.n.AccessKey()
	d.rect(kx, y, keyW, 36)
	if err := d.drawBarcode(kx+8, y+4, keyW-16, 28, key); err != nil {
		return err
	}
	d.rect(kx, y+36, keyW, 22)
	d.label(kx+2, y+37.5, keyW-4, "CHAVE DE ACESSO")
	d.text(kx+2, y+46, keyW-4, formatKey(key), true, 7.5, alignCenter)
	d.rect(kx, y+58, keyW, h-58)
	consult := d.wrap("Consulte a autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da SEFAZ autorizadora", keyW-8, false, 6.5)
	cy := y + 58 + (h-58-float64(len(consult))*8)/2
	for _, ln := range consult {
		d.text(kx+4, cy, keyW-8, ln, false, 6.5, alignCenter)
		cy += 8
	}

	d.y = y + h

	// Natureza da operação / protocolo
	prot := ""
	if p := strings.TrimSpace(d.n.Prot.NProt); p != "" {
		prot = joinNonEmpty(" - ", p, formatDateTime(d.n.Prot.DhRecbto))
	}
	d.row([]cell{
		{label: "NATUREZA DA OPERAÇÃO", value: inf.Ide.NatOp, w: emitW + danfeW},
		{label: "PROTOCOLO DE AUTORIZAÇÃO DE USO", value: prot, w: keyW, align: alignCenter},
	}, fieldH)

	// The "tipo de regime de apuração" box is reserved by the NT: no tag
	// exists yet, so it is printed empty.
	d.row([]cell{
		{label: "INSCRIÇÃO ESTADUAL", value: e.IE, w: 1.2},
		{label: "INSCRIÇÃO ESTADUAL DO SUBSTITUTO TRIBUTÁRIO", value: e.IEST, w: 1.3},
		{label: "CNPJ / CPF", value: formatDoc(firstNonEmpty(e.CNPJ, e.CPF)), w: 1.2},
		{label: "CÓDIGO DO REGIME TRIBUTÁRIO", value: formatCRT(e.CRT), w: 1.3},
		{label: "TIPO DE REGIME DE APURAÇÃO DO IBS E DA CBS", value: "", w: 1.3},
	}, fieldH)
	d.y += 3
	return nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

// drawLogo fits the company mark into the 3,20 × 2,20 cm slot (never larger
// than the box height), keeping the aspect ratio.
func (d *drawer) drawLogo(x, y, boxH float64) (float64, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(d.opt.Logo))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return 0, fmt.Errorf("danfe: logo ilegível")
	}
	maxW, maxH := LogoMaxWidthCm*cmPt, LogoMaxHeightCm*cmPt
	if maxH > boxH {
		maxH = boxH
	}
	w := maxW
	h := w * float64(cfg.Height) / float64(cfg.Width)
	if h > maxH {
		h = maxH
		w = h * float64(cfg.Width) / float64(cfg.Height)
	}
	holder, err := gopdf.ImageHolderByBytes(d.opt.Logo)
	if err != nil {
		return 0, fmt.Errorf("danfe: logo: %w", err)
	}
	if err := d.pdf.ImageByHolder(holder, x, y+(boxH-h)/2, &gopdf.Rect{W: w, H: h}); err != nil {
		return 0, fmt.Errorf("danfe: logo: %w", err)
	}
	return w, nil
}

// drawBarcode draws the access key as CODE-128C (MOC, DANFE).
func (d *drawer) drawBarcode(x, y, w, h float64, key string) error {
	if len(key) != 44 {
		return nil
	}
	bc, err := code128.Encode(key)
	if err != nil {
		return fmt.Errorf("danfe: código de barras: %w", err)
	}
	modules := bc.Bounds().Dx()
	if modules == 0 {
		return nil
	}
	mw := w / float64(modules)
	d.pdf.SetFillColor(0, 0, 0)
	start := -1
	for i := 0; i <= modules; i++ {
		black := i < modules && isBlack(bc.At(i, 0))
		if black && start < 0 {
			start = i
		}
		if !black && start >= 0 {
			d.pdf.RectFromUpperLeftWithStyle(x+float64(start)*mw, y, float64(i-start)*mw, h, "F")
			start = -1
		}
	}
	return nil
}

func isBlack(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return r+g+b < 3*0x8000
}

// -------------------------------------------------------------- recipient

func (d *drawer) drawDest() {
	inf := d.n.InfNFe
	dst := inf.Dest
	doc := formatDoc(firstNonEmpty(dst.CNPJ, dst.CPF))
	if doc == "" {
		doc = strings.TrimSpace(dst.IDEstrangeiro)
	}
	addr := joinNonEmpty(", ", dst.Ender.XLgr, dst.Ender.Nro, dst.Ender.XCpl)
	d.title("DESTINATÁRIO / REMETENTE")
	if d.opt.Orientation == Landscape {
		d.row([]cell{
			{label: "NOME / RAZÃO SOCIAL", value: dst.XNome, w: 5},
			{label: "CNPJ / CPF", value: doc, w: 1.8},
			{label: "ENDEREÇO", value: addr, w: 4.4},
			{label: "BAIRRO / DISTRITO", value: dst.Ender.XBairro, w: 2},
			{label: "DATA DE EMISSÃO", value: formatDate(inf.Ide.DhEmi), w: 1.3, align: alignCenter},
		}, fieldH)
		d.row([]cell{
			{label: "MUNICÍPIO", value: dst.Ender.XMun, w: 3.6},
			{label: "UF", value: dst.Ender.UF, w: 0.6, align: alignCenter},
			{label: "CEP", value: formatCEP(dst.Ender.CEP), w: 1.3, align: alignCenter},
			{label: "FONE / FAX", value: formatPhone(dst.Ender.Fone), w: 1.8},
			{label: "INSCRIÇÃO ESTADUAL", value: dst.IE, w: 2},
			{label: "DATA DE ENTRADA / SAÍDA", value: formatDate(inf.Ide.DhSaiEnt), w: 1.6, align: alignCenter},
			{label: "HORA DE SAÍDA", value: formatTime(inf.Ide.DhSaiEnt), w: 1.3, align: alignCenter},
			{label: "", value: "", w: 2.3},
		}, fieldH)
		d.y += 3
		return
	}
	d.row([]cell{
		{label: "NOME / RAZÃO SOCIAL", value: dst.XNome, w: 5},
		{label: "CNPJ / CPF", value: doc, w: 2},
		{label: "DATA DE EMISSÃO", value: formatDate(inf.Ide.DhEmi), w: 1.3, align: alignCenter},
	}, fieldH)
	d.row([]cell{
		{label: "ENDEREÇO", value: addr, w: 4},
		{label: "BAIRRO / DISTRITO", value: dst.Ender.XBairro, w: 2},
		{label: "CEP", value: formatCEP(dst.Ender.CEP), w: 1, align: alignCenter},
		{label: "DATA DE ENTRADA / SAÍDA", value: formatDate(inf.Ide.DhSaiEnt), w: 1.3, align: alignCenter},
	}, fieldH)
	d.row([]cell{
		{label: "MUNICÍPIO", value: dst.Ender.XMun, w: 3},
		{label: "FONE / FAX", value: formatPhone(dst.Ender.Fone), w: 1.5},
		{label: "UF", value: dst.Ender.UF, w: 0.5, align: alignCenter},
		{label: "INSCRIÇÃO ESTADUAL", value: dst.IE, w: 2},
		{label: "HORA DE SAÍDA", value: formatTime(inf.Ide.DhSaiEnt), w: 1.3, align: alignCenter},
	}, fieldH)
	d.y += 3
}

// ------------------------------------------------------------------ fatura

// drawFatura prints installments only when cobr exists (NT 4.4: facultativo).
func (d *drawer) drawFatura() {
	c := d.n.InfNFe.Cobr
	if c == nil || (len(c.Dup) == 0 && c.Fat == nil) {
		return
	}
	d.title("FATURA / DUPLICATAS")
	if len(c.Dup) == 0 {
		f := c.Fat
		d.row([]cell{
			{label: "NÚMERO DA FATURA", value: f.NFat, w: 1},
			{label: "VALOR ORIGINAL", value: money(f.VOrig), w: 1, align: alignRight},
			{label: "DESCONTO", value: money(f.VDesc), w: 1, align: alignRight},
			{label: "VALOR LÍQUIDO", value: money(f.VLiq), w: 1, align: alignRight},
		}, fieldH)
		d.y += 3
		return
	}
	const boxW, boxH = 94.0, 25.0
	perRow := int(d.l.width() / boxW)
	if perRow < 1 {
		perRow = 1
	}
	w := d.l.width() / float64(perRow)
	maxRows := 3
	for i, dup := range c.Dup {
		row, col := i/perRow, i%perRow
		if row >= maxRows {
			break
		}
		x := d.l.left + float64(col)*w
		y := d.y + float64(row)*boxH
		d.rect(x, y, w, boxH)
		d.textPair(x+2, y+2, w-4, "DUPLICATA", dup.NDup)
		d.textPair(x+2, y+9.5, w-4, "VENCIMENTO", formatDate(dup.DVenc))
		d.textPair(x+2, y+17, w-4, "VALOR", money(dup.VDup))
	}
	rows := (len(c.Dup) + perRow - 1) / perRow
	if rows > maxRows {
		rows = maxRows
	}
	d.y += float64(rows)*boxH + 3
}

func (d *drawer) textPair(x, y, w float64, label, value string) {
	d.text(x, y+0.8, w*0.48, label, false, 4.8, alignLeft)
	d.text(x+w*0.48, y, w*0.52, value, true, 6, alignRight)
}

// ------------------------------------------------------------------ totais

func (d *drawer) drawTotais() {
	t := d.n.InfNFe.Total
	it := t.ICMSTot
	d.title("TOTAL DOS PRODUTOS E TOTAL DA NOTA")
	d.row([]cell{
		{label: "VALOR TOTAL DOS PRODUTOS", value: money(it.VProd), w: 1, align: alignRight},
		{label: "VALOR DO FRETE", value: money(it.VFrete), w: 1, align: alignRight},
		{label: "VALOR DO SEGURO", value: money(it.VSeg), w: 1, align: alignRight},
		{label: "DESCONTO", value: money(it.VDesc), w: 1, align: alignRight},
		{label: "OUTRAS DESPESAS ACESSÓRIAS", value: money(it.VOutro), w: 1, align: alignRight},
		{label: "VALOR TOTAL DA NOTA", value: money(it.VNF), w: 1, align: alignRight, bold: true},
	}, fieldH)
	d.y += 3

	icms := []cell{
		{label: "BASE DE CÁLCULO DO ICMS", value: money(it.VBC)},
		{label: "VALOR DO ICMS", value: money(it.VICMS)},
		{label: "BASE DE CÁLCULO DO ICMS ST", value: money(it.VBCST)},
		{label: "VALOR DO ICMS ST", value: money(it.VST)},
		{label: "VALOR DO IPI", value: money(it.VIPI)},
		{label: "VALOR DO FCP", value: money(it.VFCP)},
		{label: "VALOR DO FCP RETIDO POR ST", value: money(it.VFCPST)},
		{label: "VALOR DO DIFAL NA UF DE DESTINO", value: money(it.VICMSUFDest)},
		{label: "VALOR DO FCP NA UF DE DESTINO", value: money(it.VFCPUFDest)},
		{label: "BC DO ICMS MONOFÁSICO", value: qty(it.QBCMono)},
		{label: "VALOR DO ICMS MONOFÁSICO", value: money(it.VICMSMono)},
		{label: "BC DO ICMS MONOFÁSICO POR RETENÇÃO", value: qty(it.QBCMonoReten)},
		{label: "VALOR DO ICMS MONOFÁSICO POR RETENÇÃO", value: money(it.VICMSMonoReten)},
	}
	d.title("TOTAL DO ICMS / IPI")
	if d.opt.Orientation == Landscape {
		d.row(weighted(icms), fieldH)
	} else {
		d.row(weighted(icms[:7]), fieldH)
		d.row(weighted(icms[7:]), fieldH)
	}
	d.y += 3

	var cbs, ibsUF, ibsMun, is, ibsMono, cbsMono, ibsMonoRet, cbsMonoRet string
	if g := t.IBSCBSTot; g != nil {
		cbs, ibsUF, ibsMun = money(g.GCBS.VCBS), money(g.GIBS.GIBSUF.VIBSUF), money(g.GIBS.GIBSMun.VIBSMun)
		if m := g.GMono; m != nil {
			ibsMono, cbsMono = money(m.VIBSMono), money(m.VCBSMono)
			ibsMonoRet, cbsMonoRet = money(m.VIBSMonoReten), money(m.VCBSMonoReten)
		}
	}
	if t.ISTot != nil {
		is = money(t.ISTot.VIS)
	}
	d.title("TOTAL DO IBS / CBS / IS")
	d.row(weighted([]cell{
		{label: "VALOR DA CBS", value: cbs},
		{label: "VALOR DO IBS UF", value: ibsUF},
		{label: "VALOR DO IBS MUNICÍPIO", value: ibsMun},
		{label: "VALOR DO IMPOSTO SELETIVO", value: is},
		{label: "VALOR DO IBS MONOFÁSICO", value: ibsMono},
		{label: "VALOR DA CBS MONOFÁSICA", value: cbsMono},
		{label: "VALOR DO IBS MONOFÁSICO POR RETENÇÃO", value: ibsMonoRet},
		{label: "VALOR DA CBS MONOFÁSICA POR RETENÇÃO", value: cbsMonoRet},
	}), fieldH)
	d.y += 3
}

func weighted(cells []cell) []cell {
	out := make([]cell, len(cells))
	for i, c := range cells {
		c.w = 1
		c.align = alignRight
		out[i] = c
	}
	return out
}

func (d *drawer) drawISSQN() {
	s := d.n.InfNFe.Total.ISSQNtot
	if s == nil {
		return
	}
	d.title("CÁLCULO DO ISSQN")
	d.row([]cell{
		{label: "INSCRIÇÃO MUNICIPAL", value: d.n.InfNFe.Emit.IM, w: 1},
		{label: "VALOR TOTAL DOS SERVIÇOS", value: money(s.VServ), w: 1, align: alignRight},
		{label: "BASE DE CÁLCULO DO ISSQN", value: money(s.VBC), w: 1, align: alignRight},
		{label: "VALOR DO ISSQN", value: money(s.VISS), w: 1, align: alignRight},
	}, fieldH)
	d.y += 3
}

// ---------------------------------------------------------------- transport

func (d *drawer) drawTransp() {
	t := d.n.InfNFe.Transp
	var name, doc, ie, ender, mun, uf, placa, placaUF, rntc string
	if tr := t.Transporta; tr != nil {
		name, doc, ie = tr.XNome, formatDoc(firstNonEmpty(tr.CNPJ, tr.CPF)), tr.IE
		ender, mun, uf = tr.XEnder, tr.XMun, tr.UF
	}
	if v := t.Veic; v != nil {
		placa, placaUF, rntc = v.Placa, v.UF, v.RNTC
	}
	d.title("TRANSPORTADOR / VOLUMES TRANSPORTADOS")
	first := []cell{
		{label: "RAZÃO SOCIAL", value: name, w: 4},
		{label: "FRETE POR CONTA", value: formatModFrete(t.ModFrete), w: 1.7},
		{label: "CÓDIGO ANTT", value: rntc, w: 1.2},
		{label: "PLACA DO VEÍCULO", value: placa, w: 1.2},
		{label: "UF", value: placaUF, w: 0.5, align: alignCenter},
		{label: "CNPJ / CPF", value: doc, w: 1.8},
	}
	second := []cell{
		{label: "ENDEREÇO", value: ender, w: 5.7},
		{label: "MUNICÍPIO", value: mun, w: 2.4},
		{label: "UF", value: uf, w: 0.5, align: alignCenter},
		{label: "INSCRIÇÃO ESTADUAL", value: ie, w: 1.8},
	}
	if d.opt.Orientation == Landscape {
		if t.Transporta != nil {
			d.row(append(first, second...), fieldH)
		} else {
			d.row(first, fieldH)
		}
	} else {
		d.row(first, fieldH)
		if t.Transporta != nil {
			d.row(second, fieldH)
		}
	}
	if len(t.Vol) > 0 {
		var qVols, pesoL, pesoB []string
		for _, v := range t.Vol {
			qVols = append(qVols, v.QVol)
			pesoL = append(pesoL, v.PesoL)
			pesoB = append(pesoB, v.PesoB)
		}
		v0 := t.Vol[0]
		esp, marca, nVol := v0.Esp, v0.Marca, v0.NVol
		if len(t.Vol) > 1 {
			esp, marca, nVol = "DIVERSOS", "DIVERSOS", "DIVERSOS"
		}
		peso := func(v string) string {
			if f := formatDecimal(v, 3, 3); f != "" {
				return f + " kg"
			}
			return ""
		}
		d.row([]cell{
			{label: "QUANTIDADE", value: formatDecimal(sumDecimals(qVols...), 0, 0), w: 1, align: alignRight},
			{label: "ESPÉCIE", value: esp, w: 1.5},
			{label: "MARCA", value: marca, w: 1.5},
			{label: "NUMERAÇÃO", value: nVol, w: 1.5},
			{label: "PESO BRUTO", value: peso(sumDecimals(pesoB...)), w: 1.3, align: alignRight},
			{label: "PESO LÍQUIDO", value: peso(sumDecimals(pesoL...)), w: 1.3, align: alignRight},
		}, fieldH)
	}
	d.y += 3
}

// ------------------------------------------------------------------ items

func (d *drawer) itemColWidths() []float64 {
	var total float64
	for _, c := range d.l.itemCols {
		total += c
	}
	out := make([]float64, len(d.l.itemCols))
	for i, c := range d.l.itemCols {
		out[i] = d.l.width() * c / total
	}
	return out
}

func (d *drawer) descLines(it itemView, w float64) []string {
	var lines []string
	for _, s := range it.Description {
		lines = append(lines, d.wrap(s, w, false, itemFont)...)
	}
	return d.clampLines(lines, maxDescLines, w, false, itemFont)
}

func (d *drawer) itemHeight(it itemView, cols []float64) float64 {
	n := len(d.descLines(it, cols[0]-4))
	if n < 4 {
		n = 4
	}
	return float64(n)*itemLine + 3
}

// drawItems prints items from start while they fit above limitY and returns
// the index of the first item not printed.
func (d *drawer) drawItems(items []itemView, start int, limitY float64) int {
	cols := d.itemColWidths()
	d.title("DADOS DOS PRODUTOS / SERVIÇOS")
	headers := []string{"DESCRIÇÃO DO PRODUTO / SERVIÇO", "CST / CFOP", "QTD / UN", "VLR UNIT", "VLR TOTAL", "BASES DE CÁLCULO", "ALÍQUOTAS", "VALOR DOS TRIBUTOS"}
	const headH = 13.0
	x := d.l.left
	for i, h := range headers {
		d.rect(x, d.y, cols[i], headH)
		d.text(x+1, d.y+4, cols[i]-2, h, true, 5, alignCenter)
		x += cols[i]
	}
	d.y += headH

	i := start
	for ; i < len(items); i++ {
		h := d.itemHeight(items[i], cols)
		// Continuation sheets always take at least one item (descriptions
		// are capped, so it fits); the first sheet may have no room left.
		if d.y+h > limitY && (i > start || d.page == 1) {
			break
		}
		d.drawItem(items[i], cols, h)
	}
	return i
}

func (d *drawer) drawItem(it itemView, cols []float64, h float64) {
	x := d.l.left
	y := d.y
	for _, w := range cols {
		d.rect(x, y, w, h)
		x += w
	}
	x = d.l.left
	ty := y + 1.8

	for i, ln := range d.descLines(it, cols[0]-4) {
		d.text(x+2, ty+float64(i)*itemLine, cols[0]-4, ln, false, itemFont, alignLeft)
	}
	x += cols[0]

	d.lineKV(x+2, ty, cols[1]-4, "CST", it.CST)
	d.lineKV(x+2, ty+itemLine, cols[1]-4, "CFOP", it.CFOP)
	x += cols[1]

	d.text(x+2, ty, cols[2]-4, it.Qty, false, itemFont, alignRight)
	d.text(x+2, ty+itemLine, cols[2]-4, it.Unit, false, itemFont, alignRight)
	x += cols[2]

	d.text(x+2, ty, cols[3]-4, it.UnitValue, false, itemFont, alignRight)
	x += cols[3]
	d.text(x+2, ty, cols[4]-4, it.Total, false, itemFont, alignRight)
	x += cols[4]

	for i, b := range it.Bases {
		d.lineKV(x+2, ty+float64(i)*itemLine, cols[5]-4, b.Label, b.Value)
	}
	x += cols[5]

	half := (cols[6] - 4) / 2
	for i, pair := range it.Rates {
		yy := ty + float64(i)*itemLine
		d.lineKV(x+2, yy, half-2, pair[0].Label, pair[0].Value)
		d.lineKV(x+2+half+2, yy, half-2, pair[1].Label, pair[1].Value)
	}
	x += cols[6]

	half = (cols[7] - 4) / 2
	for i, pair := range it.Values {
		yy := ty + float64(i)*itemLine
		d.lineKV(x+2, yy, half-2, pair[0].Label, pair[0].Value)
		d.lineKV(x+2+half+2, yy, half-2, pair[1].Label, pair[1].Value)
	}
	d.y += h
}

// lineKV prints "LABEL ....... value" inside w: label left, value right.
func (d *drawer) lineKV(x, y, w float64, label, value string) {
	d.setFont(true, itemFont-0.3)
	lw := d.textWidth(label)
	if lw > w*0.6 {
		lw = w * 0.6
	}
	d.text(x, y, lw, label, true, itemFont-0.3, alignLeft)
	d.text(x+lw+1.5, y, w-lw-1.5, value, false, itemFont, alignRight)
}

// -------------------------------------------------------------- additional

func (d *drawer) drawAdicionais(top float64) {
	inf := d.n.InfNFe
	d.y = top
	d.title("DADOS ADICIONAIS")
	h := d.l.adicH
	y := d.y
	x := d.l.left
	w := d.l.width()

	qr := strings.TrimSpace(d.n.Supl.QrCode)
	qrW := 0.0
	if qr != "" {
		qrW = h
	}
	fiscoW := w * 0.24
	infoW := w - fiscoW - qrW

	if qr != "" {
		d.rect(x, y, qrW, h)
		d.label(x+2, y+1.5, qrW-4, "QR CODE")
		if q, err := qrcode.New(qr, qrcode.Medium); err == nil {
			q.DisableBorder = true
			if png, err := q.PNG(256); err == nil {
				if holder, err := gopdf.ImageHolderByBytes(png); err == nil {
					side := h - 12
					_ = d.pdf.ImageByHolder(holder, x+(qrW-side)/2, y+8, &gopdf.Rect{W: side, H: side})
				}
			}
		}
		x += qrW
	}

	d.rect(x, y, infoW, h)
	d.label(x+2, y+1.5, infoW-4, "INFORMAÇÕES COMPLEMENTARES")
	text := joinNonEmpty("\n", inf.InfAdic.InfAdFisco, inf.InfAdic.InfCpl)
	if strings.TrimSpace(inf.Ide.TpEmis) != "" && strings.TrimSpace(inf.Ide.TpEmis) != "1" {
		text = joinNonEmpty("\n", "EMISSÃO EM CONTINGÊNCIA (tpEmis "+strings.TrimSpace(inf.Ide.TpEmis)+") "+
			joinNonEmpty(" - ", formatDateTime(inf.Ide.DhCont), inf.Ide.XJust), text)
	}
	const size, step = 6.0, 7.2
	maxLines := int((h - 9) / step)
	lines := d.clampLines(d.wrap(text, infoW-6, false, size), maxLines, infoW-6, false, size)
	for i, ln := range lines {
		d.text(x+3, y+8+float64(i)*step, infoW-6, ln, false, size, alignLeft)
	}
	x += infoW

	d.rect(x, y, fiscoW, h)
	d.label(x+2, y+1.5, fiscoW-4, "RESERVADO AO FISCO")
	d.y = y + h
}
