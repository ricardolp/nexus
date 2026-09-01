package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// --- scenario rule wire shape (spec §41-46 config screens) ---

type scenarioRuleBody struct {
	POReferencePolicy string `json:"po_reference_policy"`
	POReferenceLevel  string `json:"po_reference_level"`
	POMissingAction   string `json:"po_missing_action"`
	POResolutionMode  string `json:"po_resolution_mode"`
	PONotFoundAction  string `json:"po_not_found_action"`

	ValidateVendor        bool   `json:"validate_vendor"`
	VendorFailureAction   string `json:"vendor_failure_action"`
	VendorOverrideAllowed bool   `json:"vendor_override_allowed"`

	ValidateMaterial        bool   `json:"validate_material"`
	MaterialFailureAction   string `json:"material_failure_action"`
	MaterialOverrideAllowed bool   `json:"material_override_allowed"`

	ValidateQuantity         bool    `json:"validate_quantity"`
	QuantityTolerancePercent float64 `json:"quantity_tolerance_percent"`

	ValidatePrice         bool    `json:"validate_price"`
	PriceTolerancePercent float64 `json:"price_tolerance_percent"`

	ValidateTax      bool   `json:"validate_tax"`
	TaxFailureAction string `json:"tax_failure_action"`

	ReceiptMode              string `json:"receipt_mode"`
	InboundDeliveryMode      string `json:"inbound_delivery_mode"`
	GoodsReceiptMode         string `json:"goods_receipt_mode"`
	GoodsReceiptMovementType string `json:"goods_receipt_movement_type"`
	SupplierInvoiceMode      string `json:"supplier_invoice_mode"`

	NotifyOnReject           bool `json:"notify_on_reject"`
	CreateOccurrenceOnReject bool `json:"create_occurrence_on_reject"`
	NotifyVendorOnReject     bool `json:"notify_vendor_on_reject"`
	SefazEventOnReject       bool `json:"sefaz_event_on_reject"`

	ResponsibleEmails []string `json:"responsible_emails"`

	ConfigurationJSON json.RawMessage `json:"configuration_json,omitempty"`
}

func (b scenarioRuleBody) toInput() inbound.ScenarioRuleInput {
	return inbound.ScenarioRuleInput{
		POReferencePolicy: b.POReferencePolicy, POReferenceLevel: b.POReferenceLevel, POMissingAction: b.POMissingAction,
		POResolutionMode: b.POResolutionMode, PONotFoundAction: b.PONotFoundAction,
		ValidateVendor: b.ValidateVendor, VendorFailureAction: b.VendorFailureAction, VendorOverrideAllowed: b.VendorOverrideAllowed,
		ValidateMaterial: b.ValidateMaterial, MaterialFailureAction: b.MaterialFailureAction, MaterialOverrideAllowed: b.MaterialOverrideAllowed,
		ValidateQuantity: b.ValidateQuantity, QuantityTolerancePercent: b.QuantityTolerancePercent,
		ValidatePrice: b.ValidatePrice, PriceTolerancePercent: b.PriceTolerancePercent,
		ValidateTax: b.ValidateTax, TaxFailureAction: b.TaxFailureAction,
		ReceiptMode: b.ReceiptMode, InboundDeliveryMode: b.InboundDeliveryMode, GoodsReceiptMode: b.GoodsReceiptMode,
		GoodsReceiptMovementType: b.GoodsReceiptMovementType, SupplierInvoiceMode: b.SupplierInvoiceMode,
		NotifyOnReject: b.NotifyOnReject, CreateOccurrenceOnReject: b.CreateOccurrenceOnReject,
		NotifyVendorOnReject: b.NotifyVendorOnReject, SefazEventOnReject: b.SefazEventOnReject,
		ResponsibleEmails: b.ResponsibleEmails,
		ConfigurationJSON: b.ConfigurationJSON,
	}
}

func (a *ControlPlane) createInboundScenario(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		OrganizationCompanyID  string           `json:"organization_company_id"`
		DocumentModel          string           `json:"document_model"`
		PurchaseOrderType      string           `json:"purchase_order_type"`
		CFOP                   string           `json:"cfop"`
		VendorCNPJ             string           `json:"vendor_cnpj"`
		Plant                  string           `json:"plant"`
		PurchasingOrganization string           `json:"purchasing_organization"`
		ProcessTemplateCode    string           `json:"process_template_code"`
		Rule                   scenarioRuleBody `json:"rule"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	companyID, err := uuid.Parse(body.OrganizationCompanyID)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_company_id", "organization_company_id must be a valid uuid"))
		return
	}
	scenario, err := a.Inbound.CreateScenario(r.Context(), inbound.CreateScenarioInput{
		OrganizationID: orgID, OrganizationCompanyID: companyID,
		DocumentModel: body.DocumentModel, PurchaseOrderType: body.PurchaseOrderType, CFOP: body.CFOP,
		VendorCNPJ: body.VendorCNPJ, Plant: body.Plant, PurchasingOrganization: body.PurchasingOrganization,
		ProcessTemplateCode: body.ProcessTemplateCode, Rule: body.Rule.toInput(), ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, scenario)
}

func (a *ControlPlane) listInboundScenarios(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	scenarios, err := a.Inbound.ListScenarios(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": scenarios})
}

func (a *ControlPlane) getInboundScenario(w http.ResponseWriter, r *http.Request) {
	orgID, scenarioID, err := parseOrgAndID(r, "scenario_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	scenario, err := a.Inbound.GetScenario(r.Context(), orgID, scenarioID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, scenario)
}

func (a *ControlPlane) updateInboundScenario(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, scenarioID, err := parseOrgAndID(r, "scenario_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		OrganizationCompanyID  string           `json:"organization_company_id"`
		DocumentModel          string           `json:"document_model"`
		PurchaseOrderType      string           `json:"purchase_order_type"`
		CFOP                   string           `json:"cfop"`
		VendorCNPJ             string           `json:"vendor_cnpj"`
		Plant                  string           `json:"plant"`
		PurchasingOrganization string           `json:"purchasing_organization"`
		ProcessTemplateCode    string           `json:"process_template_code"`
		IsActive               bool             `json:"is_active"`
		Rule                   scenarioRuleBody `json:"rule"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	companyID, err := uuid.Parse(body.OrganizationCompanyID)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_company_id", "organization_company_id must be a valid uuid"))
		return
	}
	scenario, err := a.Inbound.UpdateScenario(r.Context(), inbound.UpdateScenarioInput{
		OrganizationID: orgID, ID: scenarioID, OrganizationCompanyID: companyID,
		DocumentModel: body.DocumentModel, PurchaseOrderType: body.PurchaseOrderType, CFOP: body.CFOP,
		VendorCNPJ: body.VendorCNPJ, Plant: body.Plant, PurchasingOrganization: body.PurchasingOrganization,
		ProcessTemplateCode: body.ProcessTemplateCode, IsActive: body.IsActive, Rule: body.Rule.toInput(),
		ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, scenario)
}

func (a *ControlPlane) deleteInboundScenario(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, scenarioID, err := parseOrgAndID(r, "scenario_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Inbound.DeleteScenario(r.Context(), orgID, scenarioID, p.UserID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- vendor/material De/Para mappings (spec §19) ---

func (a *ControlPlane) listVendorMaterialMappings(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	mappings, err := a.Inbound.ListVendorMaterialMappings(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": mappings})
}

func (a *ControlPlane) createVendorMaterialMapping(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		OrganizationCompanyID string `json:"organization_company_id"`
		VendorCNPJ            string `json:"vendor_cnpj"`
		SupplierMaterialCode  string `json:"supplier_material_code"`
		ResolvedMaterialCode  string `json:"resolved_material_code"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	var companyID *uuid.UUID
	if body.OrganizationCompanyID != "" {
		id, err := uuid.Parse(body.OrganizationCompanyID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "organization_company_id must be a valid uuid"))
			return
		}
		companyID = &id
	}
	mapping, err := a.Inbound.UpsertVendorMaterialMapping(r.Context(), inbound.CreateVendorMaterialMappingInput{
		OrganizationID: orgID, OrganizationCompanyID: companyID, VendorCNPJ: body.VendorCNPJ,
		SupplierMaterialCode: body.SupplierMaterialCode, ResolvedMaterialCode: body.ResolvedMaterialCode, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, mapping)
}

// --- inbound documents: list + orchestration detail ---

func (a *ControlPlane) listInboundDocuments(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	limit, err := parseLimitParam(r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if limit == 0 {
		limit = 50
	}
	docs, err := a.Inbound.ListInboundDocuments(r.Context(), inbound.ListInboundDocumentsInput{
		OrganizationID: orgID,
		Status:         r.URL.Query().Get("status"),
		DocumentType:   r.URL.Query().Get("document_type"),
		Limit:          limit,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": docs})
}

// getInboundDocument is the single-document counterpart of
// listInboundDocuments — backs the nota fiscal detail page (no direct
// GET-by-id existed before; the document was only ever reachable as a table
// row plus its /orchestration sub-resource).
func (a *ControlPlane) getInboundDocument(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	doc, err := a.Inbound.GetInboundDocument(r.Context(), orgID, docID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, r, domainerr.NotFound("document_not_found", "Document not found"))
			return
		}
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, doc)
}

// uploadInboundDocumentXML lets an authenticated org user manually feed an
// already-authorized NF-e XML into the same pipeline SEFAZ distribution and
// the OAuth-authenticated inbound API use (fiscal.Service.Receive +
// inbound.Service.IngestInbound) — for historical/legacy notes outside
// SEFAZ's ~90-day distribution window, or any note that never got picked up
// automatically. source_system is fixed to "manual_upload" (never accepted
// from the client) so these documents are always distinguishable from
// automatic ingestion in listings/audits. Idempotency is keyed off the
// note's own access key, so re-uploading the same XML twice is a no-op
// (mirrors the header's own uniqueness instead of relying on the client to
// track what it already sent).
func (a *ControlPlane) uploadInboundDocumentXML(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		OrganizationCompanyID string `json:"organization_company_id"`
		XMLBase64             string `json:"xml_base64"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	payload, err := base64.StdEncoding.DecodeString(body.XMLBase64)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_xml", "xml_base64 must be valid base64"))
		return
	}
	var companyID uuid.UUID
	if body.OrganizationCompanyID != "" {
		companyID, err = uuid.Parse(body.OrganizationCompanyID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "organization_company_id must be a valid uuid"))
			return
		}
	}

	const contentType = "application/xml"
	header, err := inbound.ExtractNFeHeader(payload, contentType)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_xml", "Failed to parse NF-e XML: "+err.Error()))
		return
	}
	if header == nil || header.AccessKey == "" {
		writeErr(w, r, domainerr.Validation("invalid_xml", "Uploaded file does not look like a valid NF-e XML (missing infNFe/access key)"))
		return
	}
	nfe := inbound.NFeExtensionFromHeader(header)

	result, err := a.Fiscal.Receive(r.Context(), fiscal.ReceiveInput{
		OrganizationID:        orgID,
		OrganizationCompanyID: companyID,
		DocumentType:          "nfe",
		Direction:             "inbound",
		SourceSystem:          "manual_upload",
		IdempotencyKey:        "manual_upload:" + header.AccessKey,
		Payload:               payload,
		ContentType:           contentType,
		ActorType:             "user",
		ActorID:               p.UserID.String(),
		CorrelationID:         httpx.CorrelationIDFrom(r.Context()),
		TraceID:               httpx.TraceIDFrom(r.Context()),
		NFe:                   nfe,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}

	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	} else {
		a.Inbound.ScheduleInboundPipeline(orgID, result.Document.OrganizationCompanyID, result.Document.ID, payload, contentType)
	}
	httpx.WriteJSON(w, status, map[string]any{
		"document_id":       result.Document.ID,
		"trace_id":          result.Document.TraceID,
		"status":            result.Document.Status,
		"processing_status": result.Document.ProcessingStatus,
		"replayed":          result.Replayed,
	})
}

// deleteManualUploadDocument lets an org user permanently remove a document
// they brought in through uploadInboundDocumentXML, so the same XML can be
// re-imported for testing without a stale idempotency key blocking it.
// fiscal.Service.DeleteManualUpload enforces source_system == "manual_upload"
// itself — this is not a general "delete any fiscal document" endpoint.
func (a *ControlPlane) deleteManualUploadDocument(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Fiscal.DeleteManualUpload(r.Context(), orgID, docID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) getOrchestration(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	view, err := a.Inbound.GetOrchestrationView(r.Context(), orgID, docID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, view)
}

// --- fiscal events: manifestação do destinatário, canhoto, and the org-wide feed ---
// These record the recipient's declared response / delivery confirmation in
// our own timeline. They do not transmit anything to SEFAZ.

func (a *ControlPlane) listFiscalEvents(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	limit, err := parseLimitParam(r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	events, err := a.Fiscal.ListOrganizationEvents(r.Context(), orgID, limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": events})
}

func (a *ControlPlane) listDocumentEvents(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	events, err := a.Fiscal.ListTimeline(r.Context(), orgID, docID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": events})
}

func (a *ControlPlane) registerManifestation(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		ManifestationType string `json:"manifestation_type"`
		Notes             string `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	event, err := a.Fiscal.RegisterManifestation(r.Context(), fiscal.RegisterManifestationInput{
		OrganizationID:    orgID,
		DocumentID:        docID,
		ManifestationType: body.ManifestationType,
		Notes:             body.Notes,
		ActorID:           p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, event)
}

func (a *ControlPlane) registerDeliveryReceipt(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		ReceivedBy string     `json:"received_by"`
		ReceivedAt *time.Time `json:"received_at"`
		Notes      string     `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	input := fiscal.RegisterDeliveryReceiptInput{
		OrganizationID: orgID,
		DocumentID:     docID,
		ReceivedBy:     body.ReceivedBy,
		Notes:          body.Notes,
		ActorID:        p.UserID,
	}
	if body.ReceivedAt != nil {
		input.ReceivedAt = *body.ReceivedAt
	}
	event, err := a.Fiscal.RegisterDeliveryReceipt(r.Context(), input)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, event)
}

// --- manual correction: patch raw item data, apply override ---

func (a *ControlPlane) patchInboundItem(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	itemID, err := uuid.Parse(chi.URLParam(r, "item_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_item_id", "Invalid item_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		SupplierMaterialCode          *string  `json:"supplier_material_code"`
		Description                   *string  `json:"description"`
		NCM                           *string  `json:"ncm"`
		CFOP                          *string  `json:"cfop"`
		Quantity                      *float64 `json:"quantity"`
		Unit                          *string  `json:"unit"`
		UnitPrice                     *float64 `json:"unit_price"`
		PurchaseOrderReferenceRaw     *string  `json:"purchase_order_reference_raw"`
		PurchaseOrderItemReferenceRaw *string  `json:"purchase_order_item_reference_raw"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	item, err := a.Inbound.PatchItem(r.Context(), inbound.PatchItemInput{
		OrganizationID: orgID, DocumentID: docID, ItemID: itemID,
		SupplierMaterialCode: body.SupplierMaterialCode, Description: body.Description, NCM: body.NCM, CFOP: body.CFOP,
		Quantity: body.Quantity, Unit: body.Unit, UnitPrice: body.UnitPrice,
		PurchaseOrderReferenceRaw: body.PurchaseOrderReferenceRaw, PurchaseOrderItemReferenceRaw: body.PurchaseOrderItemReferenceRaw,
		ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) applyInboundOverride(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		ItemID                string `json:"item_id"`
		OverrideType          string `json:"override_type"`
		OverrideValue         string `json:"override_value"`
		PurchaseOrderItem     string `json:"purchase_order_item"`
		Reason                string `json:"reason"`
		SaveAsMapping         bool   `json:"save_as_mapping"`
		OrganizationCompanyID string `json:"organization_company_id"`
		VendorCNPJ            string `json:"vendor_cnpj"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	var itemID *uuid.UUID
	if body.ItemID != "" {
		id, err := uuid.Parse(body.ItemID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_item_id", "item_id must be a valid uuid"))
			return
		}
		itemID = &id
	}
	var companyID *uuid.UUID
	if body.OrganizationCompanyID != "" {
		id, err := uuid.Parse(body.OrganizationCompanyID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "organization_company_id must be a valid uuid"))
			return
		}
		companyID = &id
	}
	override, err := a.Inbound.ApplyOverride(r.Context(), inbound.ApplyOverrideInput{
		OrganizationID: orgID, DocumentID: docID, ItemID: itemID, OverrideType: body.OverrideType,
		OverrideValue: body.OverrideValue, PurchaseOrderItem: body.PurchaseOrderItem, Reason: body.Reason,
		SaveAsMapping: body.SaveAsMapping, OrganizationCompanyID: companyID, VendorCNPJ: body.VendorCNPJ, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, override)
}

// --- interactive purchase order search (manual selection, spec §12-13) ---

func (a *ControlPlane) searchPurchaseOrders(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	orders, err := a.Inbound.SearchPurchaseOrders(r.Context(), orgID, docID, r.URL.Query().Get("purchase_order"), r.URL.Query().Get("vendor_cnpj"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": orders})
}

func (a *ControlPlane) reprocessInboundDocument(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Inbound.Reprocess(r.Context(), orgID, docID); err != nil {
		writeErr(w, r, err)
		return
	}
	view, err := a.Inbound.GetOrchestrationView(r.Context(), orgID, docID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, view)
}

// --- execution plan: build/rebuild, execute next, advance/skip a step, reject ---

func (a *ControlPlane) buildExecutionPlan(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	plan, steps, err := a.Inbound.RebuildExecutionPlan(r.Context(), orgID, docID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"plan": plan, "steps": steps})
}

func (a *ControlPlane) executeNextStep(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	step, err := a.Inbound.ExecuteNext(r.Context(), orgID, docID, "user", p.UserID.String())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, step)
}

func (a *ControlPlane) advanceInboundStep(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	stepID, err := uuid.Parse(chi.URLParam(r, "step_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_step_id", "Invalid step_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Action               string `json:"action"` // "run" (default) | "skip"
		ManualDocumentNumber string `json:"manual_document_number"`
		Reason               string `json:"reason"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	step, err := a.Inbound.AdvanceStep(r.Context(), inbound.AdvanceStepInput{
		OrganizationID: orgID, DocumentID: docID, StepID: stepID, Action: body.Action,
		ManualDocumentNumber: body.ManualDocumentNumber, Reason: body.Reason,
		ActorType: "user", ActorID: p.UserID.String(),
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, step)
}

func (a *ControlPlane) rejectInboundDocument(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if err := a.Inbound.Reject(r.Context(), inbound.RejectInput{
		OrganizationID: orgID, DocumentID: docID, Reason: body.Reason, ActorUserID: p.UserID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- SAP integration configuration (organization_integrations) ---

func (a *ControlPlane) listIntegrations(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Integrations.List(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) createIntegration(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		OrganizationCompanyID string                    `json:"organization_company_id"`
		Name                  string                    `json:"name"`
		IntegrationType       string                    `json:"integration_type"`
		Environment           string                    `json:"environment"`
		BaseURL               string                    `json:"base_url"`
		ClientSecret          string                    `json:"client_secret"`
		Configuration         integration.Configuration `json:"configuration"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	var companyID *uuid.UUID
	if body.OrganizationCompanyID != "" {
		id, err := uuid.Parse(body.OrganizationCompanyID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "organization_company_id must be a valid uuid"))
			return
		}
		companyID = &id
	}
	created, err := a.Integrations.Create(r.Context(), integration.CreateInput{
		OrganizationID: orgID, OrganizationCompanyID: companyID, Name: body.Name, IntegrationType: body.IntegrationType,
		Environment: body.Environment, BaseURL: body.BaseURL, ClientSecret: body.ClientSecret,
		Configuration: body.Configuration, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (a *ControlPlane) updateIntegration(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, integrationID, err := parseOrgAndID(r, "integration_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "integration:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Name          string                    `json:"name"`
		BaseURL       string                    `json:"base_url"`
		Status        string                    `json:"status"`
		ClientSecret  *string                   `json:"client_secret"`
		Configuration integration.Configuration `json:"configuration"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	updated, err := a.Integrations.Update(r.Context(), integration.UpdateInput{
		OrganizationID: orgID, ID: integrationID, Name: body.Name, BaseURL: body.BaseURL, Status: body.Status,
		ClientSecret: body.ClientSecret, Configuration: body.Configuration, ActorUserID: p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}

// --- shared helpers ---

// parseOrgAndID parses {organization_id} and a second named URL param
// (e.g. "document_id", "scenario_id") — the pair every inbound/integration
// endpoint below the organization needs.
func parseOrgAndID(r *http.Request, param string) (orgID, id uuid.UUID, err error) {
	orgID, err = uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_organization_id", "Invalid organization_id")
	}
	id, err = uuid.Parse(chi.URLParam(r, param))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_"+param, "Invalid "+param)
	}
	return orgID, id, nil
}
