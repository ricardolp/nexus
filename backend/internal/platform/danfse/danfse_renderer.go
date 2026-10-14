package danfse

import (
	"bytes"
	_ "embed"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"strings"

	"github.com/signintech/gopdf"
	"github.com/skip2/go-qrcode"
)

//go:embed fonts/LiberationSans-Regular.ttf
var embeddedFontReg []byte

//go:embed fonts/LiberationSans-Bold.ttf
var embeddedFontBold []byte

//go:embed assets/logo-nfse.png
var embeddedLogo []byte

// RenderOptions controls marks that are not present in the authorized XML
// (cancel/substitution are events; cStat stays 100).
// Logo, when set, replaces the national NFS-e mark in the header. Empty keeps
// the embedded national logo.
type RenderOptions struct {
	Cancelled   bool
	Substituted bool
	Logo        []byte
}

type DanfseRenderer interface {
	Render(xmlData []byte, opts ...RenderOptions) ([]byte, error)
}

type renderer struct {
	fontRegData  []byte
	fontBoldData []byte
	logoData     []byte
}

func NewDanfseRenderer() DanfseRenderer {
	return &renderer{
		fontRegData:  embeddedFontReg,
		fontBoldData: embeddedFontBold,
		logoData:     embeddedLogo,
	}
}

func cmToPt(cm float64) float64 {
	return cm * 28.34645669
}

// drawHeaderLogo fits a PNG or JPEG inside the national header slot
// (4.00 cm × 1.16 cm) without stretching, vertically centered.
func drawHeaderLogo(pdf *gopdf.GoPdf, data []byte) error {
	const maxWcm, maxHcm = 4.00, 1.16
	maxW, maxH := cmToPt(maxWcm), cmToPt(maxHcm)
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		if err == nil {
			err = fmt.Errorf("dimensões inválidas")
		}
		return fmt.Errorf("pdf: logo da danfse ilegível: %w", err)
	}
	logoW, logoH := maxW, maxW*float64(cfg.Height)/float64(cfg.Width)
	if logoH > maxH {
		logoH = maxH
		logoW = logoH * float64(cfg.Width) / float64(cfg.Height)
	}
	logoY := cmToPt(0.30)
	if logoH < maxH {
		logoY += (maxH - logoH) / 2
	}
	holder, err := gopdf.ImageHolderByBytes(data)
	if err != nil {
		return fmt.Errorf("pdf: logo da danfse: %w", err)
	}
	if err := pdf.ImageByHolder(holder, cmToPt(0.49), logoY, &gopdf.Rect{W: logoW, H: logoH}); err != nil {
		return fmt.Errorf("pdf: logo da danfse: %w", err)
	}
	return nil
}

// ufByIBGEPrefix mapeia os dois primeiros dígitos do código IBGE do município
// para a sigla da UF. Usado para derivar a UF quando o XML não a informa
// (ex.: <endNac> do tomador só traz cMun e CEP, sem UF).
var ufByIBGEPrefix = map[string]string{
	"11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
	"21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
	"31": "MG", "32": "ES", "33": "RJ", "35": "SP",
	"41": "PR", "42": "SC", "43": "RS",
	"50": "MS", "51": "MT", "52": "GO", "53": "DF",
}

// ufFromIBGE deriva a sigla da UF a partir do código IBGE do município (7 dígitos);
// retorna "" quando o código é inválido ou desconhecido.
func ufFromIBGE(cMun string) string {
	if len(cMun) < 2 {
		return ""
	}
	return ufByIBGEPrefix[cMun[:2]]
}

func mergeRenderOptions(opts []RenderOptions) RenderOptions {
	var out RenderOptions
	for _, o := range opts {
		if o.Cancelled {
			out.Cancelled = true
		}
		if o.Substituted {
			out.Substituted = true
		}
		if len(o.Logo) > 0 {
			out.Logo = o.Logo
		}
	}
	return out
}

func (r *renderer) Render(xmlData []byte, opts ...RenderOptions) ([]byte, error) {
	opt := mergeRenderOptions(opts)
	nfse, err := ParseXML(xmlData)
	if err != nil {
		return nil, fmt.Errorf("pdf: falha ao ler xml: %w", err)
	}

	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	pdf.AddPage()

	err = pdf.AddTTFFontByReader("LiberationSans", bytes.NewReader(r.fontRegData))
	if err != nil {
		return nil, fmt.Errorf("pdf: erro fonte regular: %w", err)
	}
	err = pdf.AddTTFFontByReader("LiberationSans-Bold", bytes.NewReader(r.fontBoldData))
	if err != nil {
		return nil, fmt.Errorf("pdf: erro fonte bold: %w", err)
	}

	// Borda da Página (1 pt)
	pdf.SetLineWidth(1.0)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.15), cmToPt(0.15), cmToPt(20.70), cmToPt(29.40), "D")

	// Linhas internas (0.5 pt)
	pdf.SetLineWidth(0.5)

	// HEADER
	// Header Cinza (5%)
	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(0.30), cmToPt(20.40), cmToPt(1.17), "F")
	pdf.SetFillColor(0, 0, 0)

	logo := r.logoData
	if len(opt.Logo) > 0 {
		logo = opt.Logo
	}
	if err := drawHeaderLogo(&pdf, logo); err != nil {
		return nil, err
	}

	// Textos Centrais
	pdf.SetFont("LiberationSans-Bold", "", 9)
	pdf.SetX(cmToPt(5.41))
	pdf.SetY(cmToPt(0.35))
	pdf.CellWithOption(&gopdf.Rect{W: cmToPt(10.19), H: cmToPt(0.35)}, "DANFSe v2.0", gopdf.CellOption{Align: gopdf.Center | gopdf.Top})

	pdf.SetY(cmToPt(0.65))
	pdf.SetX(cmToPt(5.41))
	pdf.CellWithOption(&gopdf.Rect{W: cmToPt(10.19), H: cmToPt(0.35)}, "Documento Auxiliar da NFS-e", gopdf.CellOption{Align: gopdf.Center | gopdf.Top})

	// Homologação: o aviso "SEM VALIDADE JURÍDICA" depende do TIPO DE AMBIENTE
	// (tpAmb: 1=produção, 2=homologação), NÃO do AmbGer (1=Prefeitura, 2=SEFIN
	// Nacional, que é 2 também em produção).
	if nfse.InfNFSe.DPS.InfDPS.TpAmb == "2" {
		pdf.SetTextColor(255, 0, 0)
		pdf.SetY(cmToPt(0.95))
		pdf.SetX(cmToPt(5.41))
		pdf.CellWithOption(&gopdf.Rect{W: cmToPt(10.19), H: cmToPt(0.35)}, "NFS-e SEM VALIDADE JURÍDICA", gopdf.CellOption{Align: gopdf.Center | gopdf.Top})
		pdf.SetTextColor(0, 0, 0)
	}

	// Textos Direita
	pdf.SetFont("LiberationSans", "", 8)
	pdf.SetY(cmToPt(0.45))
	pdf.SetX(cmToPt(15.62))
	uf := nfse.InfNFSe.Emit.EnderNac.UF
	if uf == "" {
		uf = ufFromIBGE(nfse.InfNFSe.Emit.EnderNac.CMun)
	}
	if uf == "" {
		return nil, fmt.Errorf("pdf: UF do emitente ausente e não derivável do cMun %q", nfse.InfNFSe.Emit.EnderNac.CMun)
	}
	// Portal nacional usa hífen; alinhamos ao PDF oficial.
	fitCell(&pdf, colXEnd, fmt.Sprintf("Município: %s - %s", nfse.InfNFSe.XLocEmi, uf))

	pdf.SetFont("LiberationSans", "", 6)
	pdf.SetY(cmToPt(0.85))
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Ambiente Gerador: "+nfse.InfNFSe.AmbGer)

	pdf.SetY(cmToPt(1.15))
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Tipo de Ambiente: "+nfse.InfNFSe.DPS.InfDPS.TpAmb)

	// LINHA SEPARADORA DO HEADER
	pdf.Line(cmToPt(0.30), cmToPt(1.47), cmToPt(20.70), cmToPt(1.47))

	// CHAVE DE ACESSO (Sem fundo cinza)
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(1.55))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "CHAVE DE ACESSO DA NFS-E")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(1.90))
	pdf.SetX(cmToPt(0.40))
	chaveAcessoTop := strings.TrimPrefix(nfse.InfNFSe.ID, "NFS")
	fitCell(&pdf, colXQR, chaveAcessoTop)

	// QR Code (Sem borda)
	qrUrl := "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=" + chaveAcessoTop
	// Sem o QR não há como verificar a autenticidade da NFS-e: qualquer falha da
	// cadeia aborta a geração em vez de emitir um DANFSe incompleto.
	q, err := qrcode.New(qrUrl, qrcode.Medium)
	if err != nil {
		return nil, fmt.Errorf("pdf: qrcode: %w", err)
	}
	q.DisableBorder = true
	qrBytes, err := q.PNG(256)
	if err != nil {
		return nil, fmt.Errorf("pdf: qrcode: %w", err)
	}
	imgH, err := gopdf.ImageHolderByBytes(qrBytes)
	if err != nil {
		return nil, fmt.Errorf("pdf: qrcode: %w", err)
	}
	// Y ajustado para 1.50 (encosta levemente mais no topo para dar respiro embaixo)
	err = pdf.ImageByHolder(imgH, cmToPt(17.48), cmToPt(1.60), &gopdf.Rect{W: cmToPt(1.90), H: cmToPt(1.90)})
	if err != nil {
		return nil, fmt.Errorf("pdf: qrcode: %w", err)
	}

	// A autenticidade...
	pdf.SetFont("LiberationSans", "", 6)
	// Textos descem mais 0.10cm para afastar do QR Code (ficam em 3.65, 3.85 e 4.05)
	pdf.SetY(cmToPt(3.65))
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "A autenticidade desta NFS-e pode ser verificada")

	pdf.SetY(cmToPt(3.85))
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "pela leitura deste código QR ou pela consulta da")

	pdf.SetY(cmToPt(4.05)) // Base fica em ~4.26, mantendo margem da linha 4.34
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "chave de acesso no portal nacional da NFS-e")

	// DADOS DA NOTA (NÚMERO, COMPETÊNCIA, EMISSÃO)
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(2.35))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "NÚMERO DA NFS-E")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "COMPETÊNCIA DA NFS-E")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "DATA E HORA DA EMISSÃO DA NFS-E")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(2.65))
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, dash(nfse.InfNFSe.NNFSe))

	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatDateBR(nfse.InfNFSe.DPS.InfDPS.DCompet))

	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, formatDateTimeBR(nfse.InfNFSe.DhProc))

	// DADOS DA DPS
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(3.05))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "NÚMERO DA DPS")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "SÉRIE DA DPS")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "DATA E HORA DA EMISSÃO DA DPS")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(3.35))
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, dash(nfse.InfNFSe.DPS.InfDPS.NDPS))

	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, dash(nfse.InfNFSe.DPS.InfDPS.Serie))

	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, formatDateTimeBR(nfse.InfNFSe.DPS.InfDPS.DhEmi))

	// EMITENTE DA NFS-e / SITUAÇÃO DA NFS-e / FINALIDADE
	// Fundo cinza APENAS para a célula "EMITENTE DA NFS-e"
	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(3.67), cmToPt(4.90), cmToPt(0.67), "F")
	pdf.SetFillColor(0, 0, 0)

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(3.72))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "EMITENTE DA NFS-e")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "SITUAÇÃO DA NFS-e")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "FINALIDADE")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(4.02))
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, formatTpEmit(nfse.InfNFSe.DPS.InfDPS.TpEmit))

	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatCStat(nfse.InfNFSe.CStat))

	fin := firstNonEmpty(nfse.InfNFSe.DPS.InfDPS.IBSCBS.FinNFSe, nfse.InfNFSe.IBSCBS.FinNFSe)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, formatFinNFSe(fin))

	// PRESTADOR / FORNECEDOR
	// Fundo cinza para a célula de título (Y=4.34, alt=0.63)
	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(4.34), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DO EMITENTE (Cruza a página toda, desenhada depois do fundo para sobrepor)
	pdf.Line(cmToPt(0.30), cmToPt(4.34), cmToPt(20.70), cmToPt(4.34))

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(4.41))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "PRESTADOR / FORNECEDOR")

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "CNPJ / CPF / NIF")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Indicador Municipal (Inscrição)")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Telefone")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(4.71))
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatDoc(nfse.InfNFSe.Emit.CNPJ))

	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, dash(nfse.InfNFSe.DPS.InfDPS.Prest.IM))

	fone := nfse.InfNFSe.Emit.Fone
	if fone == "" {
		fone = nfse.InfNFSe.DPS.InfDPS.Prest.Fone
	}
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, formatPhone(fone))

	// Linha 2 do Prestador
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(cmToPt(5.05))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Nome / Nome Empresarial")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Município / Sigla UF")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Código IBGE / CEP")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(5.35))
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX3, nfse.InfNFSe.Emit.XNome)

	munUF := formatMunUF(nfse.InfNFSe.Emit.EnderNac.XMun, nfse.InfNFSe.Emit.EnderNac.CMun, nfse.InfNFSe.Emit.EnderNac.UF)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, munUF)

	ibgeCep := formatIBGECEP(nfse.InfNFSe.Emit.EnderNac.CMun, nfse.InfNFSe.Emit.EnderNac.CEP)
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, ibgeCep)

	// Linha 3 do Prestador
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(cmToPt(5.69))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Endereço")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "E-mail")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(5.99))
	pdf.SetX(cmToPt(0.40))
	end := nfse.InfNFSe.Emit.EnderNac.XLgr
	if nfse.InfNFSe.Emit.EnderNac.Nro != "" {
		end += ", " + nfse.InfNFSe.Emit.EnderNac.Nro
	}
	if nfse.InfNFSe.Emit.EnderNac.XCpl != "" {
		end += ", " + nfse.InfNFSe.Emit.EnderNac.XCpl
	}
	if nfse.InfNFSe.Emit.EnderNac.XBairro != "" {
		end += ", " + nfse.InfNFSe.Emit.EnderNac.XBairro
	}
	fitCell(&pdf, colX3, end)

	email := nfse.InfNFSe.Emit.Email
	if email == "" {
		email = nfse.InfNFSe.DPS.InfDPS.Prest.Email
	}
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, dash(email))

	// Linha 4 do Prestador
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(cmToPt(6.35))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Simples Nacional na Data de Competência")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Regime de Apuração Tributária pelo SN")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(6.65))
	pdf.SetX(cmToPt(0.40))
	opSimp := formatOpSimpNac(nfse.InfNFSe.DPS.InfDPS.Prest.RegTrib.OpSimpNac)
	fitCell(&pdf, colX3, opSimp)

	pdf.SetX(cmToPt(10.51))
	regAp := formatRegApTribSN(nfse.InfNFSe.DPS.InfDPS.Prest.RegTrib.RegApTribSN)
	fitCell(&pdf, colXEnd, regAp)

	// TOMADOR / ADQUIRENTE
	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(6.92), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DO PRESTADOR (desenhada depois do fundo para sobrepor)
	pdf.Line(cmToPt(0.30), cmToPt(6.92), cmToPt(20.70), cmToPt(6.92))

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(6.99))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "TOMADOR / ADQUIRENTE")

	toma := nfse.InfNFSe.DPS.InfDPS.Toma
	if toma.XNome == "" && toma.CNPJ == "" {
		// Tomador não identificado
		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(7.29))
		pdf.SetX(cmToPt(5.41))
		pdf.Cell(nil, "TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")
	} else {
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetX(cmToPt(5.41))
		pdf.Cell(nil, "CNPJ / CPF / NIF")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "Indicador Municipal (Inscrição)")

		pdf.SetX(cmToPt(15.62))
		pdf.Cell(nil, "Telefone")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(7.29))
		pdf.SetX(cmToPt(5.41))
		fitCell(&pdf, colX3, formatDoc(toma.CNPJ))

		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colX4, dash(toma.IM))

		pdf.SetX(cmToPt(15.62))
		fitCell(&pdf, colXEnd, formatPhone(toma.Fone))

		// Linha 2 do Tomador
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetY(cmToPt(7.63))
		pdf.SetX(cmToPt(0.40))
		pdf.Cell(nil, "Nome / Nome Empresarial")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "Município / Sigla UF")

		pdf.SetX(cmToPt(15.62))
		pdf.Cell(nil, "Código IBGE / CEP")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(7.93))
		pdf.SetX(cmToPt(0.40))
		fitCell(&pdf, colX3, toma.XNome)

		munUFToma := formatMunUF(toma.End.EndNac.XMun, toma.End.EndNac.CMun, toma.End.EndNac.UF)
		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colX4, munUFToma)

		ibgeCepToma := formatIBGECEP(toma.End.EndNac.CMun, toma.End.EndNac.CEP)
		pdf.SetX(cmToPt(15.62))
		fitCell(&pdf, colXEnd, ibgeCepToma)

		// Linha 3 do Tomador
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetY(cmToPt(8.29))
		pdf.SetX(cmToPt(0.40))
		pdf.Cell(nil, "Endereço")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "E-mail")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(8.59))
		pdf.SetX(cmToPt(0.40))
		endToma := toma.End.XLgr
		if toma.End.Nro != "" {
			endToma += ", " + toma.End.Nro
		}
		if toma.End.XCpl != "" {
			endToma += ", " + toma.End.XCpl
		}
		if toma.End.XBairro != "" {
			endToma += ", " + toma.End.XBairro
		}
		fitCell(&pdf, colX3, endToma)

		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colXEnd, dash(toma.Email))
	}

	// DESTINATÁRIO DA OPERAÇÃO
	dest := nfse.InfNFSe.DPS.InfDPS.IBSCBS.Dest
	if dest.CNPJ == "" && dest.XNome == "" {
		dest = nfse.InfNFSe.IBSCBS.Dest
	}

	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(8.86), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DO TOMADOR
	pdf.Line(cmToPt(0.30), cmToPt(8.86), cmToPt(20.70), cmToPt(8.86))

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(8.93))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "DESTINATÁRIO DA OPERAÇÃO")

	if dest.XNome == "" && dest.CNPJ == "" {
		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(9.23))
		pdf.SetX(cmToPt(5.41))
		pdf.Cell(nil, "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")
	} else {
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetX(cmToPt(5.41))
		pdf.Cell(nil, "CNPJ / CPF / NIF")
		pdf.SetX(cmToPt(15.62))
		pdf.Cell(nil, "Telefone")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(9.23))
		pdf.SetX(cmToPt(5.41))
		fitCell(&pdf, colX3, formatDoc(dest.CNPJ))

		pdf.SetX(cmToPt(15.62))
		fitCell(&pdf, colXEnd, formatPhone(dest.Fone))

		// Linha 2
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetY(cmToPt(9.57))
		pdf.SetX(cmToPt(0.40))
		pdf.Cell(nil, "Nome / Nome Empresarial")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "Município / Sigla UF")

		pdf.SetX(cmToPt(15.62))
		pdf.Cell(nil, "Código IBGE / CEP")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(9.87))
		pdf.SetX(cmToPt(0.40))
		fitCell(&pdf, colX3, dest.XNome)

		munUFDest := formatMunUF(
			firstNonEmpty(dest.XMun, dest.End.EndNac.XMun),
			firstNonEmpty(dest.CMun, dest.End.EndNac.CMun),
			firstNonEmpty(dest.UF, dest.End.EndNac.UF),
		)
		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colX4, munUFDest)

		ibgeCepDest := formatIBGECEP(
			firstNonEmpty(dest.CMun, dest.End.EndNac.CMun),
			firstNonEmpty(dest.CEP, dest.End.EndNac.CEP),
		)
		pdf.SetX(cmToPt(15.62))
		fitCell(&pdf, colXEnd, ibgeCepDest)

		// Linha 3
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetY(cmToPt(10.23))
		pdf.SetX(cmToPt(0.40))
		pdf.Cell(nil, "Endereço")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "E-mail")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(10.53))
		pdf.SetX(cmToPt(0.40))
		endD := dest.End.XLgr
		if dest.End.Nro != "" {
			endD += ", " + dest.End.Nro
		}
		if dest.End.XCpl != "" {
			endD += ", " + dest.End.XCpl
		}
		if dest.End.XBairro != "" {
			endD += ", " + dest.End.XBairro
		}
		fitCell(&pdf, colX3, endD)

		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colXEnd, dash(dest.Email))
	}

	// INTERMEDIÁRIO DA OPERAÇÃO
	interm := nfse.InfNFSe.DPS.InfDPS.Interm

	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(10.80), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DO DESTINATÁRIO
	pdf.Line(cmToPt(0.30), cmToPt(10.80), cmToPt(20.70), cmToPt(10.80))

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(10.87))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "INTERMEDIÁRIO DA OPERAÇÃO")

	if interm.XNome == "" && interm.CNPJ == "" {
		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(11.17))
		pdf.SetX(cmToPt(5.41))
		pdf.Cell(nil, "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")
	} else {
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetX(cmToPt(5.41))
		pdf.Cell(nil, "CNPJ / CPF / NIF")
		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "Indicador Municipal (Inscrição)")
		pdf.SetX(cmToPt(15.62))
		pdf.Cell(nil, "Telefone")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(11.17))
		pdf.SetX(cmToPt(5.41))
		fitCell(&pdf, colX3, formatDoc(interm.CNPJ))

		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colX4, interm.IM)

		pdf.SetX(cmToPt(15.62))
		fitCell(&pdf, colXEnd, formatPhone(interm.Fone))

		// Linha 2
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetY(cmToPt(11.51))
		pdf.SetX(cmToPt(0.40))
		pdf.Cell(nil, "Nome / Nome Empresarial")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "Município / Sigla UF")

		pdf.SetX(cmToPt(15.62))
		pdf.Cell(nil, "Código IBGE / CEP")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(11.81))
		pdf.SetX(cmToPt(0.40))
		fitCell(&pdf, colX3, interm.XNome)

		munUFInt := formatMunUF(interm.XMun, interm.CMun, interm.UF)
		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colX4, munUFInt)

		ibgeCepInt := "-"
		if interm.CEP != "" {
			ibgeCepInt = interm.CMun + " / " + formatCEP(interm.CEP)
		}
		pdf.SetX(cmToPt(15.62))
		fitCell(&pdf, colXEnd, ibgeCepInt)

		// Linha 3
		pdf.SetFont("LiberationSans-Bold", "", 6)
		pdf.SetY(cmToPt(12.16))
		pdf.SetX(cmToPt(0.40))
		pdf.Cell(nil, "Endereço")

		pdf.SetX(cmToPt(10.51))
		pdf.Cell(nil, "E-mail")

		pdf.SetFont("LiberationSans", "", 7)
		pdf.SetY(cmToPt(12.46))
		pdf.SetX(cmToPt(0.40))
		endI := interm.End.XLgr
		if interm.End.Nro != "" {
			endI += ", " + interm.End.Nro
		}
		if interm.End.XCpl != "" {
			endI += ", " + interm.End.XCpl
		}
		if interm.End.XBairro != "" {
			endI += ", " + interm.End.XBairro
		}
		fitCell(&pdf, colX3, endI)

		pdf.SetX(cmToPt(10.51))
		fitCell(&pdf, colXEnd, interm.Email)
	}

	// SERVIÇO PRESTADO
	serv := nfse.InfNFSe.DPS.InfDPS.Serv

	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), cmToPt(12.74), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DO INTERMEDIÁRIO (já sobrepõe fundos anteriores e o atual)
	pdf.Line(cmToPt(0.30), cmToPt(12.74), cmToPt(20.70), cmToPt(12.74))

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(cmToPt(12.81))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "SERVIÇO PRESTADO")

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(cmToPt(12.81))
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Código de Tributação Nacional / Municipal")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Código da NBS")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Local da Prestação / Sigla UF / País")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(13.11))

	tribNac := serv.CServ.CTribNac
	tribMun := serv.CServ.CTribMun
	tribCode := formatTribNacMun(tribNac, tribMun)
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, tribCode)

	nbs := formatNBS(serv.CServ.CNBS)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, nbs)

	// O local da prestação na NFS-e autorizada vem do nível infNFSe
	// (<xLocPrestacao>, preenchido pela SEFIN); o <serv><locPrest> da DPS
	// normalmente só traz <cLocPrestacao>.
	loc := nfse.InfNFSe.XLocPrestacao
	cLocPrest := firstNonEmpty(serv.LocPrest.CMun, nfse.InfNFSe.CLocIncid)
	if loc == "" {
		loc = serv.LocPrest.XMun
	}
	if loc == "" {
		loc = ibgeCities[cLocPrest]
	}
	if loc == "" {
		loc = cLocPrest
	}
	if loc != "" {
		if uf := ufFromIBGE(cLocPrest); uf != "" {
			loc += " / " + uf
		}
		if serv.LocPrest.CPaisPrestacao != "" {
			loc += " / " + serv.LocPrest.CPaisPrestacao
		} else {
			loc += " / -"
		}
	} else {
		loc = "-"
	}
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, loc)

	// Descrição do Código de Tributação (Y=13.39 no PDF original)
	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(cmToPt(13.46)) // 13.39 + 0.07
	pdf.SetX(cmToPt(0.40))
	descTrib := serv.CServ.XTribMun
	if descTrib == "" {
		descTrib = serv.CServ.XTribNac
	}
	if descTrib == "" {
		// Na NFS-e autorizada, a descrição do código de tributação nacional é
		// preenchida pela SEFIN no nível infNFSe (<xTribNac>), não no <serv>.
		descTrib = nfse.InfNFSe.XTribNac
	}
	if descTrib == "" {
		descTrib = "-"
	}
	fitCell(&pdf, colXEnd, descTrib)

	// Descrição do Serviço (Y=13.79 no PDF original)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(cmToPt(13.86)) // 13.79 + 0.07
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Descrição do Serviço")

	pdf.SetFont("LiberationSans", "", 7)
	descServ := serv.CServ.XDescServ
	// Campo elástico (NT, item 2.1: mais de uma linha é permitido): cresce até
	// maxLinhasDescServ linhas — o orçamento de 1.297 chars da tabela 2.4.5 —
	// e o que passar disso sai com as reticências. Cada linha além da primeira
	// desloca em um passoLinha tudo entre o bloco ISSQN (Y=14,43) e o canhoto,
	// que é fixo (yCanhoto): o saldo volta às informações complementares.
	descW := cmToPt(colXEnd - colGutter - 0.40)
	linhasDesc := 1
	if linhas, err := pdf.SplitText(descServ, descW); err == nil && len(linhas) > 1 {
		linhasDesc = len(linhas)
		if linhasDesc > maxLinhasDescServ {
			linhasDesc = maxLinhasDescServ
			descServ = limitLines(&pdf, descServ, descW, maxLinhasDescServ)
		}
	}
	desloc := float64(linhasDesc-1) * passoLinha
	// dy desloca uma coordenada Y do grid base pelo crescimento da descrição.
	dy := func(cm float64) float64 { return cmToPt(cm + desloc) }

	pdf.SetY(cmToPt(14.16))
	pdf.SetX(cmToPt(0.40))
	if linhasDesc == 1 {
		fitCell(&pdf, colXEnd, descServ)
	} else {
		pdf.MultiCell(&gopdf.Rect{W: descW, H: dy(14.43) - cmToPt(14.16)}, descServ)
	}

	// ----------------------------------------------------------------------
	// TRIBUTAÇÃO MUNICIPAL (ISSQN)
	// ----------------------------------------------------------------------

	tribMunNode := nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TribMun
	issqnApurado := nfse.InfNFSe.Valores.VISSQN

	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), dy(14.43), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DA DESCRIÇÃO DO SERVIÇO (Início do próximo bloco em Y=14.43)
	// Desenhada depois do fundo para sobrepor
	pdf.Line(cmToPt(0.30), dy(14.43), cmToPt(20.70), dy(14.43))

	// Linha 1 (Y=14.43)
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(dy(14.50))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "TRIBUTAÇÃO MUNICIPAL (ISSQN)")

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(14.50))
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Tipo de Tributação do ISSQN")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Município / Sigla UF / País da Incidência do ISSQN")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(14.80))

	tpTrib := formatTribISSQN(tribMunNode.TribISSQN)
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, tpTrib)

	xLocIncid := firstNonEmpty(tribMunNode.XLocIncid, nfse.InfNFSe.XLocIncid)
	cLocIncid := firstNonEmpty(tribMunNode.CLocIncid, nfse.InfNFSe.CLocIncid)
	locIncid := formatLocIncid(xLocIncid, cLocIncid, tribMunNode.CPaisResult)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, locIncid)

	// Linha 2 (Y=15.08)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(15.15))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Regime Especial de Tributação do ISSQN")
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Tipo de Imunidade do ISSQN")
	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Suspensão da Exigibilidade do ISSQN")
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Número Processo Suspensão")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(15.45))
	regEsp := formatRegEspTrib(nfse.InfNFSe.DPS.InfDPS.Prest.RegTrib.RegEspTrib)
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, regEsp)

	imunidade := tribMunNode.TpImunidade
	if imunidade == "" {
		imunidade = "-"
	}
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, imunidade)

	suspensao := formatTpSusp(tribMunNode.ExigSusp.TpSusp)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, suspensao)

	processo := tribMunNode.ExigSusp.NProcesso
	if processo == "" {
		processo = "-"
	}
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, processo)

	// Linha 3 (Y=15.73)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(15.80))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Benefício Municipal")
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Cálculo do BM")
	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Total Deduções/Reduções")
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Desconto Incondicionado")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(16.10))
	bm := nfse.InfNFSe.Valores.TpBM
	if bm == "" {
		bm = "-"
	}
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, bm)

	calcBm := nfse.InfNFSe.Valores.VCalcBM
	if calcBm == "" {
		calcBm = tribMunNode.BM.VRedBCBM
	}
	if calcBm == "" {
		calcBm = "-"
	}
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, calcBm)

	totDed := nfse.InfNFSe.Valores.VCalcDR
	if totDed == "" {
		totDed = nfse.InfNFSe.DPS.InfDPS.Valores.VDedRed.VDR
	}
	if totDed == "" {
		totDed = "-"
	}
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, totDed)

	descInc := nfse.InfNFSe.DPS.InfDPS.Valores.VDescCondIncond.VDescIncond
	if descInc == "" {
		descInc = "-"
	}
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, descInc)

	// Linha 4 (Y=16.37)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(16.44))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "BC ISSQN")
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Alíquota Aplicada")
	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Retenção do ISSQN")
	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "ISSQN Apurado")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(16.74))
	bcIssqn := nfse.InfNFSe.Valores.VBC
	if bcIssqn == "" {
		bcIssqn = "-"
	}
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, bcIssqn)

	aliq := nfse.InfNFSe.Valores.PAliqAplic
	if aliq == "" {
		aliq = "-"
	}
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, aliq)

	retIssqn := formatTpRetISSQN(tribMunNode.TpRetISSQN)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, retIssqn)
	if issqnApurado == "" {
		issqnApurado = "-"
	}
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, issqnApurado)

	// ----------------------------------------------------------------------
	// TRIBUTAÇÃO FEDERAL (EXCETO CBS)
	// ----------------------------------------------------------------------
	tribFed := nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TribFed

	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), dy(17.02), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DO BLOCO ISSQN (Início do próximo bloco em Y=17.02)
	pdf.Line(cmToPt(0.30), dy(17.02), cmToPt(20.70), dy(17.02))

	// Linha 1 (Y=17.02)
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(dy(17.09))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "TRIBUTAÇÃO FEDERAL (EXCETO CBS)")

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "IRRF")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Contribuição Previdenciária - Retida")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Contribuições Sociais - Retidas")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(17.39))

	// Mock fallback if empty
	irrf := tribFed.VRetIRRF
	if irrf == "" {
		irrf = "-"
	}
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, irrf)

	cpRet := tribFed.VRetCP
	if cpRet == "" {
		cpRet = "-"
	}
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, cpRet)

	csllRet := tribFed.VRetCSLL
	if csllRet == "" {
		csllRet = "-"
	}
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, csllRet)

	// Linha 2 (Y=17.67)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(17.74))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "PIS - Débito Apuração Própria")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "COFINS - Débito Apuração Própria")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Descrição Contrib. Sociais - Retidas")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(18.04))

	pis := tribFed.PisCofins.VPis
	if pis == "" {
		pis = "-"
	}
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, pis)

	cofins := tribFed.PisCofins.VCofins
	if cofins == "" {
		cofins = "-"
	}
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, cofins)

	tpret := formatTpRetPisCofins(tribFed.PisCofins.TpRetPisCofins)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, tpret)

	// ----------------------------------------------------------------------
	// TRIBUTAÇÃO IBS / CBS
	// ----------------------------------------------------------------------
	// DPS: CST/cClassTrib/cIndOp/fin/dest (emitente).
	// infNFSe: valores/totCIBS calculados pela SEFIN na autorização (NT 008).
	ibsDPS := nfse.InfNFSe.DPS.InfDPS.IBSCBS
	ibsSefin := nfse.InfNFSe.IBSCBS

	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), dy(18.32), cmToPt(4.90), cmToPt(0.64), "F")
	pdf.SetFillColor(0, 0, 0)

	// LINHA DIVISÓRIA ABAIXO DA TRIBUTAÇÃO FEDERAL (Y=18.32)
	pdf.Line(cmToPt(0.30), dy(18.32), cmToPt(20.70), dy(18.32))

	// Linha 1 (Y=18.32)
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(dy(18.39))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "TRIBUTAÇÃO IBS / CBS")

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "CST / CCLASS TRIB")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Indicador Op. / IBGE Incidência / Município Incidência / UF")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(18.69))

	cst := firstNonEmpty(ibsDPS.Valores.Trib.CST, ibsDPS.Valores.Trib.GIBSCBS.CST, ibsSefin.Valores.Trib.CST, ibsSefin.Valores.Trib.GIBSCBS.CST)
	cClass := firstNonEmpty(ibsDPS.Valores.Trib.CClassTrib, ibsDPS.Valores.Trib.GIBSCBS.CClassTrib, ibsSefin.Valores.Trib.CClassTrib, ibsSefin.Valores.Trib.GIBSCBS.CClassTrib)
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatCSTClass(cst, cClass))

	cIndOp := firstNonEmpty(ibsDPS.CIndOp, ibsSefin.CIndOp)
	cLocIbs := firstNonEmpty(ibsSefin.CLocalidadeIncid, ibsDPS.CLocalidadeIncid, nfse.InfNFSe.CLocIncid)
	xLocIbs := firstNonEmpty(ibsSefin.XLocalidadeIncid, ibsDPS.XLocalidadeIncid, nfse.InfNFSe.XLocIncid)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colXEnd, formatIndOpLocal(cIndOp, cLocIbs, xLocIbs))

	// Linha 2 (Y=18.96)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(19.03))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Exclusões e Reduções da Base de Cálculo")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Base de Cálculo Após Exclusões e Reduções")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Red. Alíquota IBS / Red. Alíquota CBS")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Alíquota - IBS UF / IBS MUN")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(19.33))

	excl := sumExclusoes(
		firstNonEmpty(nfse.InfNFSe.DPS.InfDPS.Valores.VDescCondIncond.VDescIncond, ibsSefin.Valores.VDescIncond, ibsDPS.Valores.VDescIncond),
		firstNonEmpty(ibsSefin.Valores.VCalcReeRepRes, ibsDPS.Valores.VCalcReeRepRes),
		nfse.InfNFSe.Valores.VISSQN,
		nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TribFed.PisCofins.VPis,
		nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TribFed.PisCofins.VCofins,
	)
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, excl)

	bcIbscbs := firstNonEmpty(ibsSefin.Valores.VBC, ibsDPS.Valores.VBC)
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatCurrencyOrDash(bcIbscbs))

	redUF := firstNonEmpty(ibsSefin.Valores.UF.PRedAliqUF, ibsDPS.Valores.UF.PRedAliqUF)
	redMun := firstNonEmpty(ibsSefin.Valores.Mun.PRedAliqMun, ibsDPS.Valores.Mun.PRedAliqMun)
	redCBS := firstNonEmpty(ibsSefin.Valores.Fed.PRedAliqCBS, ibsDPS.Valores.Fed.PRedAliqCBS)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, formatPercentTriple(redUF, redMun, redCBS))

	aliqUF := firstNonEmpty(ibsSefin.Valores.UF.PIBSUF, ibsDPS.Valores.UF.PIBSUF)
	aliqMun := firstNonEmpty(ibsSefin.Valores.Mun.PIBSMun, ibsDPS.Valores.Mun.PIBSMun)
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, formatPercentPair(aliqUF, aliqMun))

	// Linha 3 (Y=19.61)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(19.68))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Alíq. Efetiva Municipal - IBS")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Valor Apurado Municipal - IBS")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Alíq. Efetiva Estadual - IBS")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Valor Apurado Estadual - IBS")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(19.98))

	aliqEfetMun := firstNonEmpty(ibsSefin.Valores.Mun.PAliqEfetMun, ibsDPS.Valores.Mun.PAliqEfetMun)
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, formatPercent(aliqEfetMun))

	vIbsMun := firstNonEmpty(ibsSefin.TotCIBS.GIBS.GIBSMunTot.VIBSMun, ibsDPS.TotCIBS.GIBS.GIBSMunTot.VIBSMun)
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatCurrencyOrDash(vIbsMun))

	aliqEfetUf := firstNonEmpty(ibsSefin.Valores.UF.PAliqEfetUF, ibsDPS.Valores.UF.PAliqEfetUF)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, formatPercent(aliqEfetUf))

	vIbsUf := firstNonEmpty(ibsSefin.TotCIBS.GIBS.GIBSUFTot.VIBSUF, ibsDPS.TotCIBS.GIBS.GIBSUFTot.VIBSUF)
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, formatCurrencyOrDash(vIbsUf))

	// Linha 4 (Y=20.26)
	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(20.33))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Valor Total Apurado - IBS")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Alíquota - CBS")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Alíquota Efetiva - CBS")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Valor Total Apurado - CBS")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(20.63))

	vIbsTot := firstNonEmpty(ibsSefin.TotCIBS.GIBS.VIBSTot, ibsDPS.TotCIBS.GIBS.VIBSTot)
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, formatCurrencyOrDash(vIbsTot))

	pCbs := firstNonEmpty(ibsSefin.Valores.Fed.PCBS, ibsDPS.Valores.Fed.PCBS)
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatPercent(pCbs))

	aliqEfetCbs := firstNonEmpty(ibsSefin.Valores.Fed.PAliqEfetCBS, ibsDPS.Valores.Fed.PAliqEfetCBS)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, formatPercent(aliqEfetCbs))

	vCbs := firstNonEmpty(ibsSefin.TotCIBS.GCBS.VCBS, ibsDPS.TotCIBS.GCBS.VCBS)
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, formatCurrencyOrDash(vCbs))

	// ----------------------------------------------------------------------
	// VALOR TOTAL DA NFS-E
	// ----------------------------------------------------------------------
	pdf.SetFillColor(242, 242, 242)
	pdf.RectFromUpperLeftWithStyle(cmToPt(0.30), dy(20.90), cmToPt(4.90), cmToPt(0.67), "F")
	pdf.SetFillColor(0, 0, 0)

	pdf.Line(cmToPt(0.30), dy(20.90), cmToPt(20.70), dy(20.90))

	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(dy(20.97))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "VALOR TOTAL DA NFS-E")

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Valor da Operação / Serviço")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Desconto Incondicionado")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Desconto Condicionado")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(21.27))

	vServ := nfse.InfNFSe.DPS.InfDPS.Valores.VServPrest.VServ
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatCurrencyOrDash(vServ))

	vDescIncond := nfse.InfNFSe.DPS.InfDPS.Valores.VDescCondIncond.VDescIncond
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, formatCurrencyOrDash(vDescIncond))

	vDescCond := nfse.InfNFSe.DPS.InfDPS.Valores.VDescCondIncond.VDescCond
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, formatCurrencyOrDash(vDescCond))

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(dy(21.66))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "Total das Retenções (ISSQN / Federais)")

	pdf.SetX(cmToPt(5.41))
	pdf.Cell(nil, "Valor Líquido da NFS-e")

	pdf.SetX(cmToPt(10.51))
	pdf.Cell(nil, "Total do IBS/CBS")

	pdf.SetX(cmToPt(15.62))
	pdf.Cell(nil, "Valor Líquido da NFS-e + IBS/CBS")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(21.96))

	vTotalRet := nfse.InfNFSe.Valores.VTotalRet
	pdf.SetX(cmToPt(0.40))
	fitCell(&pdf, colX2, formatCurrencyOrDash(vTotalRet))

	vLiq := nfse.InfNFSe.Valores.VLiq
	pdf.SetX(cmToPt(5.41))
	fitCell(&pdf, colX3, formatCurrencyOrDash(vLiq))

	vTotIbsCbs := sumCurrency(vIbsTot, vCbs)
	pdf.SetX(cmToPt(10.51))
	fitCell(&pdf, colX4, vTotIbsCbs)

	vTotNF := firstNonEmpty(ibsSefin.TotCIBS.VTotNF, ibsDPS.TotCIBS.VTotNF, vLiq)
	pdf.SetX(cmToPt(15.62))
	fitCell(&pdf, colXEnd, formatCurrencyOrDash(vTotNF))

	pdf.Line(cmToPt(0.30), dy(22.27), cmToPt(20.70), dy(22.27))

	// ----------------------------------------------------------------------
	// INFORMAÇÕES COMPLEMENTARES
	// ----------------------------------------------------------------------
	pdf.SetFont("LiberationSans-Bold", "", 7)
	pdf.SetY(dy(22.34))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "INFORMAÇÕES COMPLEMENTARES")

	pdf.SetFont("LiberationSans", "", 7)
	pdf.SetY(dy(yInfoCompl))
	xOutInf := nfse.InfNFSe.DPS.InfDPS.Serv.InfoCompl.XOutInf
	if lei := lei12741Line(
		nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TotTrib.PTotTribSN,
		nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TotTrib.VTotTrib.VTotTribFed,
		nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TotTrib.VTotTrib.VTotTribEst,
		nfse.InfNFSe.DPS.InfDPS.Valores.Trib.TotTrib.VTotTrib.VTotTribMun,
	); lei != "" {
		if strings.TrimSpace(xOutInf) == "" {
			xOutInf = lei
		} else if !strings.Contains(strings.ToLower(xOutInf), "12.741") {
			xOutInf = strings.TrimSpace(xOutInf) + "\n" + lei
		}
	}
	if xOutInf != "" {
		pdf.SetX(cmToPt(0.40))
		altura := cmToPt(yCanhoto-0.05) - dy(yInfoCompl)
		pdf.MultiCell(&gopdf.Rect{W: cmToPt(20.00), H: altura},
			limitLines(&pdf, xOutInf, cmToPt(20.00), linhasInfoCompl(desloc)))
	}

	// ----------------------------------------------------------------------
	// DATA CIENTIFICAÇÃO E ASSINATURA
	// ----------------------------------------------------------------------
	pdf.Line(cmToPt(0.30), cmToPt(28.10), cmToPt(20.70), cmToPt(28.10))
	pdf.Line(cmToPt(0.30), cmToPt(28.77), cmToPt(20.70), cmToPt(28.77))
	pdf.Line(cmToPt(0.30), cmToPt(28.10), cmToPt(0.30), cmToPt(28.77))
	pdf.Line(cmToPt(20.70), cmToPt(28.10), cmToPt(20.70), cmToPt(28.77))
	pdf.Line(cmToPt(5.41), cmToPt(28.10), cmToPt(5.41), cmToPt(28.77))
	pdf.Line(cmToPt(10.51), cmToPt(28.10), cmToPt(10.51), cmToPt(28.77))

	pdf.SetFont("LiberationSans-Bold", "", 6)
	pdf.SetY(cmToPt(28.17))
	pdf.SetX(cmToPt(0.40))
	pdf.Cell(nil, "DATA CIENTIFICAÇÃO:")

	pdf.SetX(cmToPt(5.51))
	pdf.Cell(nil, "IDENTIFICAÇÃO E ASSINATURA")

	pdf.SetX(cmToPt(10.61))
	pdf.Cell(nil, "Nº NFS-e / CHAVE NFS-e")

	pdf.SetFont("LiberationSans", "", 6)
	pdf.SetY(cmToPt(28.47))
	nNFSe := nfse.InfNFSe.NNFSe
	chave := strings.TrimPrefix(nfse.InfNFSe.ID, "NFS")
	if nNFSe == "" {
		nNFSe = "-"
	}
	if chave == "" {
		chave = "-"
	}

	pdf.SetX(cmToPt(10.61))
	fitCell(&pdf, colXEnd, nNFSe+" / "+chave)

	// NT 008 §2.5: marca d'água diagonal CANCELADA / SUBSTITUÍDA (evento, não cStat).
	drawStatusWatermark(&pdf, opt)

	var buf bytes.Buffer
	_, err = pdf.WriteTo(&buf)
	if err != nil {
		return nil, fmt.Errorf("pdf: erro ao renderizar: %w", err)
	}
	return buf.Bytes(), nil
}

func drawStatusWatermark(pdf *gopdf.GoPdf, opt RenderOptions) {
	label := ""
	switch {
	case opt.Substituted:
		label = "SUBSTITUÍDA"
	case opt.Cancelled:
		label = "CANCELADA"
	default:
		return
	}
	// K35 ≈ RGB 166; NT pede ≥50pt, diagonal.
	pageW := gopdf.PageSizeA4.W
	pageH := gopdf.PageSizeA4.H
	cx, cy := pageW/2, pageH/2
	_ = pdf.SetFont("LiberationSans", "", 54)
	pdf.SetTextColor(166, 166, 166)
	pdf.Rotate(45, cx, cy)
	tw, _ := pdf.MeasureTextWidth(label)
	pdf.SetX(cx - tw/2)
	pdf.SetY(cy - 20)
	pdf.Cell(nil, label)
	pdf.RotateReset()
	pdf.SetTextColor(0, 0, 0)
}
