package inbound

import (
	"context"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

// matchVendor resolves the fiscal issuer CNPJ against a SAP Business
// Partner/Vendor (spec §15) and persists the outcome as a document-level
// match (organization_nfe_item_id is nil).
//
// TEMPORARY: the LS Mtron CPI tenant only exposes /http/Nexus/DOCUMENTS
// (PurchaseOrders). There is no /vendors/resolve iFlow yet, so calling
// adapter.ResolveVendor always fails and the orchestrator parks the
// document as sap_unavailable before PO/material matching can run. Skip
// the SAP call and treat the issuer CNPJ as provisionally matched; the
// real vendor code (fornecedor) still comes back from PO search later.
func matchVendor(ctx context.Context, tx dbtx, adapter sap.Adapter, organizationID, documentID uuid.UUID, issuerCNPJ string) (Match, sap.VendorResolution, error) {
	_ = adapter
	resolution := sap.VendorResolution{Status: MatchStatusMatched}
	m, err := insertMatch(ctx, tx, Match{
		OrganizationID:         organizationID,
		OrganizationDocumentID: documentID,
		MatchType:              MatchTypeVendor,
		SourceValue:            nullEmptyStr(issuerCNPJ),
		ResolvedValue:          nullEmptyStr(issuerCNPJ),
		Strategy:               nullEmptyStr("cnpj_skipped_temp"),
		Status:                 MatchStatusMatched,
	})
	return m, resolution, err
}
