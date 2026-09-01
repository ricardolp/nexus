package inbound

// Document status vocabulary (spec §32) — written into the existing
// organization_documents.status column, which has no CHECK constraint, so
// it coexists with the outbound vocabulary already used by package fiscal
// (received/submitted/authorized/rejected/failed). Only inbound NF-e/NFS-e
// documents processed by this package use these values.
const (
	DocStatusReceived        = "RECEIVED"
	DocStatusXMLValidated    = "XML_VALIDATED"
	DocStatusClassified      = "CLASSIFIED"
	DocStatusMatching        = "MATCHING"
	DocStatusValidating      = "VALIDATING"
	DocStatusActionRequired  = "ACTION_REQUIRED"
	DocStatusReadyForPosting = "READY_FOR_POSTING"
	DocStatusExecuting       = "EXECUTING"
	DocStatusPOCreated       = "PO_CREATED"
	DocStatusDeliveryCreated = "DELIVERY_CREATED"
	DocStatusGRPosted        = "GR_POSTED"
	DocStatusInvoicePosted   = "INVOICE_POSTED"
	DocStatusCompleted       = "COMPLETED"
	DocStatusBlocked         = "BLOCKED"
	DocStatusRejected        = "REJECTED"
	DocStatusFailed          = "FAILED"
)

// IsTerminalInboundStatus mirrors fiscal.IsTerminalStatus for the inbound
// vocabulary above.
func IsTerminalInboundStatus(status string) bool {
	switch status {
	case DocStatusCompleted, DocStatusRejected, DocStatusFailed:
		return true
	default:
		return false
	}
}

// Item status (organization_nfe_items.status).
const (
	ItemStatusPending         = "PENDING"
	ItemStatusMatched         = "MATCHED"
	ItemStatusNeedsCorrection = "NEEDS_CORRECTION"
	ItemStatusBlocked         = "BLOCKED"
	ItemStatusSkipped         = "SKIPPED"
)

// Match type/status (organization_document_matches).
const (
	MatchTypeVendor            = "VENDOR"
	MatchTypeMaterial          = "MATERIAL"
	MatchTypePurchaseOrder     = "PURCHASE_ORDER"
	MatchTypePurchaseOrderItem = "PURCHASE_ORDER_ITEM"

	MatchStatusMatched   = "MATCHED"
	MatchStatusNotFound  = "NOT_FOUND"
	MatchStatusMultiple  = "MULTIPLE_MATCH"
	MatchStatusManualMap = "MANUAL_MAPPING"
	MatchStatusBlocked   = "BLOCKED"
	MatchStatusInactive  = "INACTIVE"
)

// Validation type/status (organization_document_validations, spec §21-22).
const (
	ValidationTypeVendor      = "VENDOR"
	ValidationTypeMaterial    = "MATERIAL"
	ValidationTypeQuantity    = "QUANTITY"
	ValidationTypePrice       = "PRICE"
	ValidationTypeTax         = "TAX"
	ValidationTypePOReference = "PO_REFERENCE"

	ValidationStatusPass           = "PASS"
	ValidationStatusWarning        = "WARNING"
	ValidationStatusBlocked        = "BLOCKED"
	ValidationStatusActionRequired = "ACTION_REQUIRED"
	ValidationStatusOverridden     = "OVERRIDDEN"
	ValidationStatusSkipped        = "SKIPPED"
)

// Override type (organization_document_overrides, spec §53).
const (
	OverrideTypeVendor            = "VENDOR"
	OverrideTypeMaterial          = "MATERIAL"
	OverrideTypePurchaseOrder     = "PURCHASE_ORDER"
	OverrideTypePurchaseOrderItem = "PURCHASE_ORDER_ITEM"
	OverrideTypeQuantity          = "QUANTITY"
	OverrideTypePrice             = "PRICE"
)

// Scenario rule enums (spec §10, §21, §25, §27-29).
const (
	POReferencePolicyRequired = "REQUIRED"
	POReferencePolicyOptional = "OPTIONAL"
	POReferencePolicyIgnore   = "IGNORE"

	POReferenceLevelDocument       = "DOCUMENT"
	POReferenceLevelItem           = "ITEM"
	POReferenceLevelDocumentOrItem = "DOCUMENT_OR_ITEM"

	POMissingActionReject            = "REJECT"
	POMissingActionWaitUser          = "WAIT_USER"
	POMissingActionSearchSAP         = "SEARCH_SAP"
	POMissingActionCreatePO          = "CREATE_PO"
	POMissingActionContinueWithoutPO = "CONTINUE_WITHOUT_PO"

	POResolutionRequiredExisting = "REQUIRED_EXISTING"
	POResolutionFindExisting     = "FIND_EXISTING"
	POResolutionFindOrCreate     = "FIND_OR_CREATE"
	POResolutionManualSelection  = "MANUAL_SELECTION"
	POResolutionCreate           = "CREATE"
	POResolutionOptional         = "OPTIONAL"
	POResolutionNone             = "NONE"

	PONotFoundReject            = "REJECT"
	PONotFoundWaitUser          = "WAIT_USER"
	PONotFoundCreatePO          = "CREATE_PO"
	PONotFoundSearchAlternative = "SEARCH_ALTERNATIVE"

	FailureActionPass     = "PASS"
	FailureActionWarn     = "WARN"
	FailureActionBlock    = "BLOCK"
	FailureActionWaitUser = "WAIT_USER"
	FailureActionReject   = "REJECT"

	ReceiptModeInboundDelivery    = "INBOUND_DELIVERY"
	ReceiptModeDirectGoodsReceipt = "DIRECT_GOODS_RECEIPT"
	ReceiptModeEWM                = "EWM_INBOUND"
	ReceiptModeServiceEntry       = "SERVICE_ENTRY"
	ReceiptModeNoGoodsReceipt     = "NO_GOODS_RECEIPT"
	ReceiptModeManual             = "MANUAL"

	StepConfigDisabled    = "DISABLED"
	StepConfigAuto        = "AUTO"
	StepConfigManual      = "MANUAL"
	StepConfigConditional = "CONDITIONAL"
)

// Execution plan step types (spec §31/§55).
const (
	StepResolveVendor          = "RESOLVE_VENDOR"
	StepResolveMaterial        = "RESOLVE_MATERIAL"
	StepSearchPurchaseOrder    = "SEARCH_PURCHASE_ORDER"
	StepCreatePurchaseOrder    = "CREATE_PURCHASE_ORDER"
	StepCreateInboundDelivery  = "CREATE_INBOUND_DELIVERY"
	StepPostGoodsReceipt       = "POST_GOODS_RECEIPT"
	StepCreateServiceEntry     = "CREATE_SERVICE_ENTRY"
	StepPostSupplierInvoice    = "POST_SUPPLIER_INVOICE"
	StepPostAccountingDocument = "POST_ACCOUNTING_DOCUMENT"
)

// Execution plan step mode/status.
const (
	StepExecModeAuto   = "AUTO"
	StepExecModeManual = "MANUAL"

	PlanStepStatusPending        = "PENDING"
	PlanStepStatusReady          = "READY"
	PlanStepStatusAwaitingManual = "AWAITING_MANUAL"
	PlanStepStatusActionRequired = "ACTION_REQUIRED"
	PlanStepStatusRunning        = "RUNNING"
	PlanStepStatusDone           = "DONE"
	PlanStepStatusSkipped        = "SKIPPED"
	PlanStepStatusFailed         = "FAILED"
	PlanStepStatusBlocked        = "BLOCKED"
)

// IsOpenPlanStepStatus reports whether a step is still awaiting some form
// of progress (used to decide whether the document can be considered
// finished).
func IsOpenPlanStepStatus(status string) bool {
	switch status {
	case PlanStepStatusDone, PlanStepStatusSkipped:
		return false
	default:
		return true
	}
}

// Execution plan status.
const (
	PlanStatusDraft     = "DRAFT"
	PlanStatusReady     = "READY"
	PlanStatusExecuting = "EXECUTING"
	PlanStatusCompleted = "COMPLETED"
	PlanStatusFailed    = "FAILED"
	PlanStatusCancelled = "CANCELLED"
)
