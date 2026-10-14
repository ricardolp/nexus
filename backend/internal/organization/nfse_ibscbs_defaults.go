package organization

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// NFSeIBSCBSDefaults are the reforma tributária fields a company service in the
// NFS-e catalog supplies when the SAP payload omits them. Empty strings mean
// "not configured".
type NFSeIBSCBSDefaults struct {
	ServiceID          uuid.UUID
	CST                string
	ClassTrib          string
	OperationIndicator string
}

func (d NFSeIBSCBSDefaults) Empty() bool {
	return d.CST == "" && d.ClassTrib == "" && d.OperationIndicator == ""
}

// nfseIBSCBSDefaultsUpdate is the validated catalog change. A nil input
// pointer means "field not sent": on update the stored value is kept, so a
// client that does not know these fields never wipes them.
type nfseIBSCBSDefaultsUpdate struct {
	CST, ClassTrib, OperationIndicator string
	SetClassification                  bool
	SetOperationIndicator              bool
}

// normalizeNFSeIBSCBSDefaults validates the catalog fields:
// CST (3 digits) and cClassTrib (6 digits, prefixed by the CST) go together;
// cIndOp (Anexo VII da NFS-e) is 6 digits and may be set alone. Empty strings
// clear the stored value.
func normalizeNFSeIBSCBSDefaults(cstIn, classTribIn, indOpIn *string) (nfseIBSCBSDefaultsUpdate, error) {
	var out nfseIBSCBSDefaultsUpdate
	if cstIn != nil || classTribIn != nil {
		out.SetClassification = true
		cst := onlyDigits(derefTrim(cstIn))
		classTrib := onlyDigits(derefTrim(classTribIn))
		if (cst == "") != (classTrib == "") {
			return out, domainerr.Validation(
				"invalid_ibs_cbs_defaults",
				"ibs_cbs_cst and ibs_cbs_class_trib must be informed together",
			)
		}
		if cst != "" && len(cst) != 3 {
			return out, domainerr.Validation("invalid_ibs_cbs_cst", "ibs_cbs_cst must have 3 digits")
		}
		if classTrib != "" {
			if len(classTrib) != 6 {
				return out, domainerr.Validation("invalid_ibs_cbs_class_trib", "ibs_cbs_class_trib must have 6 digits")
			}
			if !strings.HasPrefix(classTrib, cst) {
				return out, domainerr.Validation(
					"invalid_ibs_cbs_class_trib",
					"ibs_cbs_class_trib must start with the CST (e.g. CST 000 → cClassTrib 000001)",
				)
			}
		}
		out.CST, out.ClassTrib = cst, classTrib
	}
	if indOpIn != nil {
		out.SetOperationIndicator = true
		indOp := onlyDigits(derefTrim(indOpIn))
		if indOp != "" && len(indOp) != 6 {
			return out, domainerr.Validation(
				"invalid_ibs_cbs_operation_indicator",
				"ibs_cbs_operation_indicator (cIndOp) must have 6 digits",
			)
		}
		out.OperationIndicator = indOp
	}
	return out, nil
}

func derefTrim(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}

// FindNFSeIBSCBSDefaults returns the IBS/CBS defaults of the active catalog
// service that best matches the outbound NFS-e: same LC 116 item and NBS
// first, then same LC 116 item, then same NBS. Item and NBS are compared by
// digits only ("17.09" == "1709", "1.1501.10.00" == "115011000"); a 6-digit
// cTribNac ("170901") also matches its 4-digit LC 116 item.
func (s *Service) FindNFSeIBSCBSDefaults(ctx context.Context, organizationID, companyID uuid.UUID, serviceListItem, nbsCode string) (*NFSeIBSCBSDefaults, error) {
	item := onlyDigits(serviceListItem)
	nbs := onlyDigits(nbsCode)
	if item == "" && nbs == "" {
		return nil, nil
	}
	itemShort := item
	if len(itemShort) > 4 {
		itemShort = itemShort[:4]
	}
	var out NFSeIBSCBSDefaults
	var cst, classTrib, indOp *string
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			with candidates as (
				select id, ibs_cbs_cst, ibs_cbs_class_trib, ibs_cbs_operation_indicator,
				       regexp_replace(coalesce(service_list_item, ''), '[^0-9]', '', 'g') as item_digits,
				       regexp_replace(coalesce(nbs_code, ''), '[^0-9]', '', 'g') as nbs_digits,
				       is_primary, sort_order
				from organization_company_nfse_services
				where organization_id = $1
				  and organization_company_id = $2
				  and status = 'active'
				  and (ibs_cbs_cst is not null or ibs_cbs_operation_indicator is not null)
			)
			select id, ibs_cbs_cst, ibs_cbs_class_trib, ibs_cbs_operation_indicator
			from candidates
			where ($3 <> '' and (item_digits = $3 or left(item_digits, 4) = $4))
			   or ($5 <> '' and nbs_digits = $5)
			order by
				case
					when $3 <> '' and $5 <> '' and (item_digits = $3 or left(item_digits, 4) = $4) and nbs_digits = $5 then 0
					when $3 <> '' and (item_digits = $3 or left(item_digits, 4) = $4) then 1
					else 2
				end,
				is_primary desc,
				sort_order
			limit 1
		`, organizationID, companyID, item, itemShort, nbs).Scan(&out.ServiceID, &cst, &classTrib, &indOp)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if cst != nil {
		out.CST = strings.TrimSpace(*cst)
	}
	if classTrib != nil {
		out.ClassTrib = strings.TrimSpace(*classTrib)
	}
	if indOp != nil {
		out.OperationIndicator = strings.TrimSpace(*indOp)
	}
	if out.Empty() {
		return nil, nil
	}
	return &out, nil
}
