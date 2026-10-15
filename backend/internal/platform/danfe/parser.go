package danfe

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Tags are matched by local name: the authorized XML may come as nfeProc
// (NF-e + protNFe) or as a bare NFe, always in the portalfiscal namespace.

type NFe struct {
	InfNFe InfNFe  `xml:"infNFe"`
	Supl   InfSupl `xml:"infNFeSupl"`
	Prot   InfProt `xml:"-"`
}

type InfSupl struct {
	QrCode   string `xml:"qrCode"`
	URLChave string `xml:"urlChave"`
}

type InfProt struct {
	ChNFe    string `xml:"chNFe"`
	DhRecbto string `xml:"dhRecbto"`
	NProt    string `xml:"nProt"`
	CStat    string `xml:"cStat"`
}

type InfNFe struct {
	ID      string  `xml:"Id,attr"`
	Ide     Ide     `xml:"ide"`
	Emit    Emit    `xml:"emit"`
	Dest    Dest    `xml:"dest"`
	Det     []Det   `xml:"det"`
	Total   Total   `xml:"total"`
	Transp  Transp  `xml:"transp"`
	Cobr    *Cobr   `xml:"cobr"`
	InfAdic InfAdic `xml:"infAdic"`
}

type Ide struct {
	NatOp    string `xml:"natOp"`
	Mod      string `xml:"mod"`
	Serie    string `xml:"serie"`
	NNF      string `xml:"nNF"`
	DhEmi    string `xml:"dhEmi"`
	DhSaiEnt string `xml:"dhSaiEnt"`
	TpNF     string `xml:"tpNF"`
	TpImp    string `xml:"tpImp"`
	TpEmis   string `xml:"tpEmis"`
	TpAmb    string `xml:"tpAmb"`
	DhCont   string `xml:"dhCont"`
	XJust    string `xml:"xJust"`
}

type Endereco struct {
	XLgr    string `xml:"xLgr"`
	Nro     string `xml:"nro"`
	XCpl    string `xml:"xCpl"`
	XBairro string `xml:"xBairro"`
	CMun    string `xml:"cMun"`
	XMun    string `xml:"xMun"`
	UF      string `xml:"UF"`
	CEP     string `xml:"CEP"`
	Fone    string `xml:"fone"`
}

type Emit struct {
	CNPJ  string   `xml:"CNPJ"`
	CPF   string   `xml:"CPF"`
	XNome string   `xml:"xNome"`
	XFant string   `xml:"xFant"`
	Ender Endereco `xml:"enderEmit"`
	IE    string   `xml:"IE"`
	IEST  string   `xml:"IEST"`
	IM    string   `xml:"IM"`
	CRT   string   `xml:"CRT"`
}

type Dest struct {
	CNPJ          string   `xml:"CNPJ"`
	CPF           string   `xml:"CPF"`
	IDEstrangeiro string   `xml:"idEstrangeiro"`
	XNome         string   `xml:"xNome"`
	Ender         Endereco `xml:"enderDest"`
	IE            string   `xml:"IE"`
}

type Det struct {
	NItem     string  `xml:"nItem,attr"`
	Prod      Prod    `xml:"prod"`
	Imposto   Imposto `xml:"imposto"`
	InfAdProd string  `xml:"infAdProd"`
}

type Prod struct {
	CProd  string `xml:"cProd"`
	XProd  string `xml:"xProd"`
	NCM    string `xml:"NCM"`
	CFOP   string `xml:"CFOP"`
	UCom   string `xml:"uCom"`
	QCom   string `xml:"qCom"`
	VUnCom string `xml:"vUnCom"`
	VProd  string `xml:"vProd"`
}

type Imposto struct {
	ICMS   ICMS    `xml:"ICMS"`
	IPI    *IPI    `xml:"IPI"`
	IS     *IS     `xml:"IS"`
	IBSCBS *IBSCBS `xml:"IBSCBS"`
}

// ICMS holds one of ICMS00..ICMS90, ICMSPart, ICMSST or ICMSSN101..900.
type ICMS struct {
	Groups []ICMSGroup `xml:",any"`
}

type ICMSGroup struct {
	XMLName xml.Name
	Orig    string `xml:"orig"`
	CST     string `xml:"CST"`
	CSOSN   string `xml:"CSOSN"`
	VBC     string `xml:"vBC"`
	PICMS   string `xml:"pICMS"`
	VICMS   string `xml:"vICMS"`
}

type IPI struct {
	Trib *IPITrib `xml:"IPITrib"`
	NT   *struct {
		CST string `xml:"CST"`
	} `xml:"IPINT"`
}

type IPITrib struct {
	CST  string `xml:"CST"`
	VBC  string `xml:"vBC"`
	PIPI string `xml:"pIPI"`
	VIPI string `xml:"vIPI"`
}

type IS struct {
	CSTIS        string `xml:"CSTIS"`
	CClassTribIS string `xml:"cClassTribIS"`
	VBCIS        string `xml:"vBCIS"`
	PIS          string `xml:"pIS"`
	VIS          string `xml:"vIS"`
}

type IBSCBS struct {
	CST        string   `xml:"CST"`
	CClassTrib string   `xml:"cClassTrib"`
	G          *GIBSCBS `xml:"gIBSCBS"`
}

type GIBSCBS struct {
	VBC    string   `xml:"vBC"`
	GIBSUF GTributo `xml:"gIBSUF"`
	GIBSMn GTributo `xml:"gIBSMun"`
	GCBS   GTributo `xml:"gCBS"`
}

// GTributo reads gIBSUF / gIBSMun / gCBS; only one of the p*/v* pairs is set
// per group, so the three are unified here.
type GTributo struct {
	PIBSUF  string `xml:"pIBSUF"`
	VIBSUF  string `xml:"vIBSUF"`
	PIBSMun string `xml:"pIBSMun"`
	VIBSMun string `xml:"vIBSMun"`
	PCBS    string `xml:"pCBS"`
	VCBS    string `xml:"vCBS"`
	GRed    *struct {
		PRedAliq  string `xml:"pRedAliq"`
		PAliqEfet string `xml:"pAliqEfet"`
	} `xml:"gRed"`
}

type Total struct {
	ICMSTot   ICMSTot    `xml:"ICMSTot"`
	ISSQNtot  *ISSQNtot  `xml:"ISSQNtot"`
	ISTot     *ISTot     `xml:"ISTot"`
	IBSCBSTot *IBSCBSTot `xml:"IBSCBSTot"`
	VNFTot    string     `xml:"vNFTot"`
}

type ICMSTot struct {
	VBC            string `xml:"vBC"`
	VICMS          string `xml:"vICMS"`
	VFCPUFDest     string `xml:"vFCPUFDest"`
	VICMSUFDest    string `xml:"vICMSUFDest"`
	VFCP           string `xml:"vFCP"`
	VBCST          string `xml:"vBCST"`
	VST            string `xml:"vST"`
	VFCPST         string `xml:"vFCPST"`
	QBCMono        string `xml:"qBCMono"`
	VICMSMono      string `xml:"vICMSMono"`
	QBCMonoReten   string `xml:"qBCMonoReten"`
	VICMSMonoReten string `xml:"vICMSMonoReten"`
	VProd          string `xml:"vProd"`
	VFrete         string `xml:"vFrete"`
	VSeg           string `xml:"vSeg"`
	VDesc          string `xml:"vDesc"`
	VIPI           string `xml:"vIPI"`
	VOutro         string `xml:"vOutro"`
	VNF            string `xml:"vNF"`
	VTotTrib       string `xml:"vTotTrib"`
}

type ISSQNtot struct {
	VServ string `xml:"vServ"`
	VBC   string `xml:"vBC"`
	VISS  string `xml:"vISS"`
}

type ISTot struct {
	VIS string `xml:"vIS"`
}

type IBSCBSTot struct {
	VBCIBSCBS string `xml:"vBCIBSCBS"`
	GIBS      struct {
		GIBSUF struct {
			VIBSUF string `xml:"vIBSUF"`
		} `xml:"gIBSUF"`
		GIBSMun struct {
			VIBSMun string `xml:"vIBSMun"`
		} `xml:"gIBSMun"`
		VIBS string `xml:"vIBS"`
	} `xml:"gIBS"`
	GCBS struct {
		VCBS string `xml:"vCBS"`
	} `xml:"gCBS"`
	GMono *struct {
		VIBSMono      string `xml:"vIBSMono"`
		VCBSMono      string `xml:"vCBSMono"`
		VIBSMonoReten string `xml:"vIBSMonoReten"`
		VCBSMonoReten string `xml:"vCBSMonoReten"`
	} `xml:"gMono"`
}

type Transp struct {
	ModFrete   string `xml:"modFrete"`
	Transporta *struct {
		CNPJ   string `xml:"CNPJ"`
		CPF    string `xml:"CPF"`
		XNome  string `xml:"xNome"`
		IE     string `xml:"IE"`
		XEnder string `xml:"xEnder"`
		XMun   string `xml:"xMun"`
		UF     string `xml:"UF"`
	} `xml:"transporta"`
	Veic *struct {
		Placa string `xml:"placa"`
		UF    string `xml:"UF"`
		RNTC  string `xml:"RNTC"`
	} `xml:"veicTransp"`
	Vol []Vol `xml:"vol"`
}

type Vol struct {
	QVol  string `xml:"qVol"`
	Esp   string `xml:"esp"`
	Marca string `xml:"marca"`
	NVol  string `xml:"nVol"`
	PesoL string `xml:"pesoL"`
	PesoB string `xml:"pesoB"`
}

type Cobr struct {
	Fat *struct {
		NFat  string `xml:"nFat"`
		VOrig string `xml:"vOrig"`
		VDesc string `xml:"vDesc"`
		VLiq  string `xml:"vLiq"`
	} `xml:"fat"`
	Dup []Dup `xml:"dup"`
}

type Dup struct {
	NDup  string `xml:"nDup"`
	DVenc string `xml:"dVenc"`
	VDup  string `xml:"vDup"`
}

type InfAdic struct {
	InfAdFisco string `xml:"infAdFisco"`
	InfCpl     string `xml:"infCpl"`
}

type nfeProc struct {
	NFe  NFe `xml:"NFe"`
	Prot struct {
		Inf InfProt `xml:"infProt"`
	} `xml:"protNFe"`
}

// ParseXML reads an authorized nfeProc (or a bare NFe) of model 55.
func ParseXML(data []byte) (*NFe, error) {
	root, err := rootName(data)
	if err != nil {
		return nil, err
	}
	var out NFe
	switch root {
	case "nfeProc":
		var p nfeProc
		if err := xml.Unmarshal(data, &p); err != nil {
			return nil, err
		}
		out = p.NFe
		out.Prot = p.Prot.Inf
	case "NFe":
		if err := xml.Unmarshal(data, &out); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("xml não é uma NF-e (raiz %q)", root)
	}
	if strings.TrimSpace(out.InfNFe.ID) == "" {
		return nil, errors.New("infNFe/@Id ausente")
	}
	if m := strings.TrimSpace(out.InfNFe.Ide.Mod); m != "" && m != "55" {
		return nil, fmt.Errorf("DANFE só se aplica ao modelo 55 (mod=%s)", m)
	}
	return &out, nil
}

func rootName(data []byte) (string, error) {
	dec := xml.NewDecoder(bytes.NewReader(data))
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return "", errors.New("xml vazio")
		}
		if err != nil {
			return "", err
		}
		if se, ok := tok.(xml.StartElement); ok {
			return se.Name.Local, nil
		}
	}
}

// AccessKey returns the 44-digit key from infNFe/@Id (or protNFe/chNFe).
func (n *NFe) AccessKey() string {
	if k := digitsOnly(n.InfNFe.ID); len(k) == 44 {
		return k
	}
	return digitsOnly(n.Prot.ChNFe)
}

// icms returns the item's ICMS group (first one found).
func (i Imposto) icms() ICMSGroup {
	if len(i.ICMS.Groups) > 0 {
		return i.ICMS.Groups[0]
	}
	return ICMSGroup{}
}

// cstCSOSN is orig + CST (or orig + CSOSN for Simples Nacional).
func (g ICMSGroup) cstCSOSN() string {
	code := g.CST
	if code == "" {
		code = g.CSOSN
	}
	if code == "" {
		return ""
	}
	return g.Orig + code
}

// effective returns the rate to print: pAliqEfet when gRed is present
// (redução ou compra governamental), otherwise the nominal rate.
func (t GTributo) effective(nominal string) string {
	if t.GRed != nil && strings.TrimSpace(t.GRed.PAliqEfet) != "" {
		return t.GRed.PAliqEfet
	}
	return nominal
}
