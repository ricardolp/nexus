package email

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

func (s *Service) ListTemplates(ctx context.Context, organizationID, companyID uuid.UUID) ([]Template, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
	`, companyID, organizationID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, domainerr.NotFound("company_not_found", "Company not found")
	}

	if err := s.ensureTemplateCatalog(ctx, organizationID, companyID); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, process_code, enabled, subject,
		       to_addresses, cc_addresses, body_html, from_name, from_address,
		       attach_xml, attach_danfe_sefaz, attach_danfe_custom, use_partner_email, use_recipient_email, created_at, updated_at
		from organization_company_email_templates
		where organization_company_id = $1
		order by process_code
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Template
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Service) UpdateTemplate(ctx context.Context, in UpdateTemplateInput) (*Template, error) {
	if _, ok := processByCode(in.ProcessCode); !ok {
		return nil, domainerr.Validation("invalid_process", "unsupported process code")
	}

	if err := s.ensureTemplateCatalog(ctx, in.OrganizationID, in.CompanyID); err != nil {
		return nil, err
	}

	var toAddrs, ccAddrs []string
	if in.ToAddresses != nil {
		normalized, err := NormalizeAddresses(in.ToAddresses)
		if err != nil {
			return nil, err
		}
		toAddrs = normalized
	}
	if in.CcAddresses != nil {
		normalized, err := NormalizeAddresses(in.CcAddresses)
		if err != nil {
			return nil, err
		}
		ccAddrs = normalized
	}

	if in.FromAddress != nil && strings.TrimSpace(*in.FromAddress) != "" {
		normalized, err := normalizeFromAddress(*in.FromAddress)
		if err != nil {
			return nil, err
		}
		v := normalized
		in.FromAddress = &v
	}

	now := time.Now().UTC()
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			select id, enabled, subject, to_addresses, cc_addresses, body_html, from_name, from_address,
			       attach_xml, attach_danfe_sefaz, attach_danfe_custom, use_partner_email, use_recipient_email
			from organization_company_email_templates
			where organization_company_id = $1 and process_code = $2
			for update
		`, in.CompanyID, in.ProcessCode)

		var (
			id        uuid.UUID
			enabled   bool
			subject   string
			to        []string
			cc        []string
			bodyHTML  string
			fromName  *string
			fromAddr  *string
			attachXML bool
			attachSEF bool
			attachCust bool
			usePartner bool
			useRecipient bool
		)
		if err := row.Scan(&id, &enabled, &subject, &to, &cc, &bodyHTML, &fromName, &fromAddr,
			&attachXML, &attachSEF, &attachCust, &usePartner, &useRecipient); err != nil {
			return err
		}

		if in.Enabled != nil {
			enabled = *in.Enabled
		}
		if in.Subject != nil {
			subject = strings.TrimSpace(*in.Subject)
		}
		if in.ToAddresses != nil {
			to = toAddrs
		}
		if in.CcAddresses != nil {
			cc = ccAddrs
		}
		if in.BodyHTML != nil {
			bodyHTML = SanitizeHTML(*in.BodyHTML)
		}
		if in.ClearFromOverride {
			fromName, fromAddr = nil, nil
		} else {
			if in.FromName != nil {
				v := strings.TrimSpace(*in.FromName)
				if v == "" {
					fromName = nil
				} else {
					fromName = &v
				}
			}
			if in.FromAddress != nil {
				if strings.TrimSpace(*in.FromAddress) == "" {
					fromAddr = nil
				} else {
					fromAddr = in.FromAddress
				}
			}
		}
		if in.AttachXML != nil {
			attachXML = *in.AttachXML
		}
		if in.AttachDanfeSEFAZ != nil {
			attachSEF = *in.AttachDanfeSEFAZ
		}
		if in.AttachDanfeCustom != nil {
			attachCust = *in.AttachDanfeCustom
		}
		if in.UsePartnerEmail != nil {
			usePartner = *in.UsePartnerEmail
		}
		if in.UseRecipientEmail != nil {
			useRecipient = *in.UseRecipientEmail
		}

		if enabled && len(to) == 0 && !usePartner && !useRecipient {
			return domainerr.Validation("to_required", "add manual recipients or enable automatic partner/recipient email")
		}

		_, err := tx.Exec(ctx, `
			update organization_company_email_templates
			set enabled = $2, subject = $3, to_addresses = $4, cc_addresses = $5, body_html = $6,
			    from_name = $7, from_address = $8, attach_xml = $9, attach_danfe_sefaz = $10,
			    attach_danfe_custom = $11, use_partner_email = $12, use_recipient_email = $13, updated_at = $14
			where id = $1
		`, id, enabled, subject, to, cc, bodyHTML, fromName, fromAddr, attachXML, attachSEF, attachCust, usePartner, useRecipient, now)
		return err
	})
	if err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, process_code, enabled, subject,
		       to_addresses, cc_addresses, body_html, from_name, from_address,
		       attach_xml, attach_danfe_sefaz, attach_danfe_custom, use_partner_email, use_recipient_email, created_at, updated_at
		from organization_company_email_templates
		where organization_company_id = $1 and process_code = $2
	`, in.CompanyID, in.ProcessCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, domainerr.NotFound("template_not_found", "Template not found")
	}
	t, err := scanTemplate(rows)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Service) ensureTemplateCatalog(ctx context.Context, organizationID, companyID uuid.UUID) error {
	now := time.Now().UTC()
	for _, p := range Catalog {
		_, err := s.pool.Exec(ctx, `
			insert into organization_company_email_templates (
				id, organization_id, organization_company_id, process_code, enabled,
				subject, to_addresses, cc_addresses, body_html, attach_xml,
				attach_danfe_sefaz, attach_danfe_custom, created_at, updated_at
			) values ($1,$2,$3,$4,false,'', '{}', '{}', '', false, false, false, $5, $5)
			on conflict (organization_company_id, process_code) do nothing
		`, ids.New(), organizationID, companyID, p.Code, now)
		if err != nil {
			return err
		}
	}
	return nil
}

type templateScanner interface {
	Scan(dest ...any) error
}

func scanTemplate(scanner templateScanner) (Template, error) {
	var t Template
	var fromName, fromAddr *string
	err := scanner.Scan(&t.ID, &t.OrganizationID, &t.OrganizationCompanyID, &t.ProcessCode, &t.Enabled,
		&t.Subject, &t.ToAddresses, &t.CcAddresses, &t.BodyHTML, &fromName, &fromAddr,
		&t.AttachXML, &t.AttachDanfeSEFAZ, &t.AttachDanfeCustom, &t.UsePartnerEmail, &t.UseRecipientEmail, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return t, err
	}
	t.FromName = fromName
	t.FromAddress = fromAddr
	if def, ok := processByCode(t.ProcessCode); ok {
		t.ProcessLabel = def.Label
	}
	return t, nil
}

func (s *Service) getEnabledTemplate(ctx context.Context, companyID uuid.UUID, processCode string) (*Template, error) {
	row := s.pool.QueryRow(ctx, `
		select id, organization_id, organization_company_id, process_code, enabled, subject,
		       to_addresses, cc_addresses, body_html, from_name, from_address,
		       attach_xml, attach_danfe_sefaz, attach_danfe_custom, use_partner_email, use_recipient_email, created_at, updated_at
		from organization_company_email_templates
		where organization_company_id = $1 and process_code = $2 and enabled = true
	`, companyID, processCode)

	var t Template
	var fromName, fromAddr *string
	err := row.Scan(&t.ID, &t.OrganizationID, &t.OrganizationCompanyID, &t.ProcessCode, &t.Enabled,
		&t.Subject, &t.ToAddresses, &t.CcAddresses, &t.BodyHTML, &fromName, &fromAddr,
		&t.AttachXML, &t.AttachDanfeSEFAZ, &t.AttachDanfeCustom, &t.UsePartnerEmail, &t.UseRecipientEmail, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.FromName = fromName
	t.FromAddress = fromAddr
	if def, ok := processByCode(t.ProcessCode); ok {
		t.ProcessLabel = def.Label
	}
	return &t, nil
}
