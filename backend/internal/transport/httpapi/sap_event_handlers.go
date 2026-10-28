package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// sapDanfeMaxBodyBytes fits a base64 DANFE of fiscal.MaxDanfePDFBytes plus
// the JSON envelope.
const sapDanfeMaxBodyBytes = fiscal.MaxDanfePDFBytes*4/3 + (64 << 10)

// SAPDanfeBodyLimit raises the inbound_api body limit for the DANFE upload
// route only; every other request keeps the default limit.
func SAPDanfeBodyLimit(r *http.Request) int64 {
	if r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/v1/nfe/documents/sap/") &&
		strings.HasSuffix(r.URL.Path, "/danfe") {
		return sapDanfeMaxBodyBytes
	}
	return 0
}

// sapEventRoutes registers the frozen SAP event/DANFE contract under
// /v1/nfe/documents/sap (X-Org-Token auth, see legacyOrgTokenAuth).
// POST .../cancel accepts NF-e (44-digit key) and NFS-e (national key,
// document id, or municipal number).
func (a *InboundAPI) sapEventRoutes(r chi.Router, base string) {
	r.Post(base+"/cancel", a.sapCancelNFe)
	r.Post(base+"/cce", a.sapCCe)
	r.Post(base+"/inutilization", a.sapInutilization)
	r.Get(base+"/{chave_acesso}/status", a.sapNFeStatus)
	r.Post(base+"/{chave_acesso}/protocol", a.sapRequestProtocol)
	r.Get(base+"/{chave_acesso}/xml", a.sapDownloadXML)
	r.Get(base+"/{chave_acesso}/events/{tipo_evento}/{n_seq_evento}/xml", a.sapDownloadEventXML)
	r.Post(base+"/{chave_acesso}/danfe", a.sapUploadDanfe)
	r.Get(base+"/{chave_acesso}/danfe", a.sapDownloadDanfe)
	r.Get(base+"/{chave_acesso}/danfe/retrato", a.sapDownloadGeneratedDanfe(fiscal.PayloadDanfeRetrato))
	r.Get(base+"/{chave_acesso}/danfe/paisagem", a.sapDownloadGeneratedDanfe(fiscal.PayloadDanfePaisagem))
}

type sapCancelBody struct {
	ChaveAcesso   string `json:"chave_acesso"`
	AccessKey     string `json:"access_key"`
	Justificativa string `json:"justificativa"`
	// CMotivo is NFS-e only (1 erro na emissão, 2 serviço não prestado, 9 outros).
	// Omitted values default to 1 so the NF-e body still cancels a service note.
	CMotivo       string `json:"c_motivo"`
	CNPJPrestador string `json:"cnpj_prestador"`
}

type sapCCeBody struct {
	ChaveAcesso string `json:"chave_acesso"`
	AccessKey   string `json:"access_key"`
	Correcao    string `json:"correcao"`
	NSeqEvento  int    `json:"n_seq_evento"`
	DataEvento  string `json:"data_evento"`
}

type sapInutilizationBody struct {
	CNPJEmitente  string `json:"cnpj_emitente"`
	Serie         string `json:"serie"`
	NumeroInicial int    `json:"numero_inicial"`
	NumeroFinal   int    `json:"numero_final"`
	Ano           int    `json:"ano"`
	Justificativa string `json:"justificativa"`
}

type sapDanfeBody struct {
	PDFBase64 string `json:"pdf_base64"`
	Filename  string `json:"filename"`
}

// rejectSAPEventOnEmissionRoute catches CC-e / cancel bodies posted to the
// NF-e emission route, which would otherwise fail with a misleading
// missing_issuer error.
func rejectSAPEventOnEmissionRoute(payload []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(payload, &top); err != nil {
		return nil
	}
	if _, ok := top["cnpj_emitente"]; ok {
		return nil
	}
	if _, ok := top["correcao"]; ok {
		return domainerr.Validation("use_event_endpoint",
			"This looks like a carta de correção; POST it to /v1/nfe/documents/sap/cce with chave_acesso, correcao and n_seq_evento")
	}
	if _, ok := top["justificativa"]; ok {
		return domainerr.Validation("use_event_endpoint",
			"This looks like an NF-e cancel; POST it to /v1/nfe/documents/sap/cancel with chave_acesso and justificativa")
	}
	return nil
}

func sapAccessKey(primary, alias string) string {
	if strings.TrimSpace(primary) != "" {
		return primary
	}
	return alias
}

// sapPrincipal checks the outbound scope every SAP event route requires.
func sapPrincipal(w http.ResponseWriter, r *http.Request) (*auth.Principal, bool) {
	p, _ := auth.PrincipalFrom(r.Context())
	if !auth.HasAnyScope(p, "fiscal_documents:outbound:create", "fiscal_documents:create") {
		writeErr(w, r, domainerr.Forbidden("Missing scope fiscal_documents:outbound:create"))
		return nil, false
	}
	return p, true
}

func (a *InboundAPI) resolveSAPNFe(w http.ResponseWriter, r *http.Request, p *auth.Principal, accessKey string) (*fiscal.Document, bool) {
	doc, err := a.Fiscal.ResolveSAPOutboundNFe(r.Context(), p.OrganizationID, accessKey)
	if err != nil {
		writeErr(w, r, err)
		return nil, false
	}
	return doc, true
}

func writeSAPEventAccepted(w http.ResponseWriter, doc *fiscal.Document) {
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{
		"document_id":       doc.ID,
		"status":            doc.Status,
		"processing_status": doc.ProcessingStatus,
	})
}

func writeSAPDownload(w http.ResponseWriter, dl *fiscal.DocumentPayloadDownload) {
	w.Header().Set("Content-Type", dl.ContentType)
	w.Header().Set("Content-Disposition", httpx.AttachmentDisposition(dl.Filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(dl.Data)
}

func (a *InboundAPI) sapCancelNFe(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	var body sapCancelBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	doc, err := a.Fiscal.ResolveSAPCancelDocument(r.Context(), p.OrganizationID, sapAccessKey(body.ChaveAcesso, body.AccessKey), body.CNPJPrestador)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if strings.EqualFold(doc.DocumentType, "nfse") {
		cMotivo := strings.TrimSpace(body.CMotivo)
		if cMotivo == "" {
			cMotivo = "1"
		}
		updated, err := a.Fiscal.RequestCancelNFSe(r.Context(), p.OrganizationID, doc.ID,
			fiscal.CancelNFSeInput{CMotivo: cMotivo, Justificativa: body.Justificativa}, "api_client", p.ClientID)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		writeSAPEventAccepted(w, updated)
		return
	}
	updated, err := a.Fiscal.RequestCancelNFe(r.Context(), p.OrganizationID, doc.ID,
		fiscal.CancelNFeInput{Justificativa: body.Justificativa}, "api_client", p.ClientID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPEventAccepted(w, updated)
}

func (a *InboundAPI) sapCCe(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	var body sapCCeBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	doc, ok := a.resolveSAPNFe(w, r, p, sapAccessKey(body.ChaveAcesso, body.AccessKey))
	if !ok {
		return
	}
	updated, err := a.Fiscal.RequestCCe(r.Context(), p.OrganizationID, doc.ID,
		fiscal.CCeInput{Correcao: body.Correcao, NSeqEvento: body.NSeqEvento}, "api_client", p.ClientID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPEventAccepted(w, updated)
}

func (a *InboundAPI) sapInutilization(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	var body sapInutilizationBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if strings.TrimSpace(body.CNPJEmitente) == "" {
		writeErr(w, r, domainerr.Validation("missing_issuer", "cnpj_emitente is required"))
		return
	}
	company, err := a.Orgs.GetCompanyByCNPJ(r.Context(), p.OrganizationID, body.CNPJEmitente)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	ano := body.Ano
	if ano > 0 && ano < 100 {
		ano += 2000
	}
	if err := a.Fiscal.RequestInutilization(r.Context(), p.OrganizationID, fiscal.InutilizationInput{
		OrganizationCompanyID: company.ID,
		Serie:                 body.Serie,
		NumeroInicial:         body.NumeroInicial,
		NumeroFinal:           body.NumeroFinal,
		Ano:                   ano,
		Justificativa:         body.Justificativa,
	}, "api_client", p.ClientID); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{"status": "queued"})
}

func (a *InboundAPI) sapNFeStatus(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	doc, ok := a.resolveSAPNFe(w, r, p, chi.URLParam(r, "chave_acesso"))
	if !ok {
		return
	}
	status, err := a.Fiscal.GetSAPNFeStatus(r.Context(), doc)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, status)
}

func (a *InboundAPI) sapRequestProtocol(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	doc, ok := a.resolveSAPNFe(w, r, p, chi.URLParam(r, "chave_acesso"))
	if !ok {
		return
	}
	updated, err := a.Fiscal.RequestProtocol(r.Context(), p.OrganizationID, doc.ID, "api_client", p.ClientID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPEventAccepted(w, updated)
}

func (a *InboundAPI) sapDownloadXML(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	doc, ok := a.resolveSAPNFeByRef(w, r, p, chi.URLParam(r, "chave_acesso"))
	if !ok {
		return
	}
	dl, err := a.Fiscal.DownloadPayload(r.Context(), p.OrganizationID, doc.ID, fiscal.PayloadSefazResponse)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPDownload(w, dl)
}

func (a *InboundAPI) sapDownloadNFSeXML(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	doc, err := a.Fiscal.ResolveSAPOutboundNFSe(r.Context(), p.OrganizationID, chi.URLParam(r, "chave_acesso"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	dl, err := a.Fiscal.DownloadPayload(r.Context(), p.OrganizationID, doc.ID, fiscal.PayloadSefazResponse)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPDownload(w, dl)
}

// resolveSAPNFeByRef accepts the 44-digit access key or the document UUID.
func (a *InboundAPI) resolveSAPNFeByRef(w http.ResponseWriter, r *http.Request, p *auth.Principal, ref string) (*fiscal.Document, bool) {
	ref = strings.TrimSpace(ref)
	if id, err := uuid.Parse(ref); err == nil {
		doc, err := a.Fiscal.GetDocument(r.Context(), p.OrganizationID, id)
		if err != nil {
			writeErr(w, r, err)
			return nil, false
		}
		if !strings.EqualFold(doc.DocumentType, "nfe") || !strings.EqualFold(doc.Direction, "outbound") {
			writeErr(w, r, domainerr.NotFound("document_not_found", "No outbound NF-e found for this document_id"))
			return nil, false
		}
		return doc, true
	}
	return a.resolveSAPNFe(w, r, p, ref)
}

func (a *InboundAPI) sapDownloadEventXML(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	seq, err := strconv.Atoi(chi.URLParam(r, "n_seq_evento"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_n_seq_evento", "n_seq_evento must be a number"))
		return
	}
	doc, ok := a.resolveSAPNFe(w, r, p, chi.URLParam(r, "chave_acesso"))
	if !ok {
		return
	}
	dl, err := a.Fiscal.LoadEventPayloadBySeq(r.Context(), doc, chi.URLParam(r, "tipo_evento"), seq)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPDownload(w, dl)
}

func (a *InboundAPI) sapUploadDanfe(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	var body sapDanfeBody
	defer r.Body.Close()
	if err := json.NewDecoder(io.LimitReader(r.Body, sapDanfeMaxBodyBytes)).Decode(&body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body (or DANFE larger than the allowed size)"))
		return
	}
	pdf, err := fiscal.DecodeDanfePDF(body.PDFBase64)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	doc, ok := a.resolveSAPNFe(w, r, p, chi.URLParam(r, "chave_acesso"))
	if !ok {
		return
	}
	if err := a.Fiscal.StoreDanfe(r.Context(), doc, pdf, body.Filename, "api_client", p.ClientID); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"document_id": doc.ID,
		"size_bytes":  len(pdf),
	})
}

func (a *InboundAPI) sapDownloadDanfse(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	doc, err := a.Fiscal.ResolveSAPOutboundNFSe(r.Context(), p.OrganizationID, chi.URLParam(r, "chave_acesso"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	dl, err := a.Fiscal.DownloadPayload(r.Context(), p.OrganizationID, doc.ID, fiscal.PayloadDanfse)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPDownload(w, dl)
}

// sapDownloadGeneratedDanfe serves the DANFE Nexus generates from the
// authorized XML (NT 2026.010), apart from the PDF SAP uploaded.
func (a *InboundAPI) sapDownloadGeneratedDanfe(payloadType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := sapPrincipal(w, r)
		if !ok {
			return
		}
		doc, ok := a.resolveSAPNFe(w, r, p, chi.URLParam(r, "chave_acesso"))
		if !ok {
			return
		}
		dl, err := a.Fiscal.DownloadPayload(r.Context(), p.OrganizationID, doc.ID, payloadType)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		writeSAPDownload(w, dl)
	}
}

func (a *InboundAPI) sapDownloadDanfe(w http.ResponseWriter, r *http.Request) {
	p, ok := sapPrincipal(w, r)
	if !ok {
		return
	}
	doc, ok := a.resolveSAPNFe(w, r, p, chi.URLParam(r, "chave_acesso"))
	if !ok {
		return
	}
	dl, err := a.Fiscal.DownloadPayload(r.Context(), p.OrganizationID, doc.ID, fiscal.PayloadDanfe)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeSAPDownload(w, dl)
}
