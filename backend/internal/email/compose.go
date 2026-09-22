package email

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
)

type documentContext struct {
	AccessKey           string
	Series              string
	Number              string
	IssuerCNPJ          string
	RecipientDocument   string
	IssuedAt            *time.Time
	Details             inbound.NFeDetails
	CompanyLegalName    string
	CompanyTradeName    string
	PayloadObjectKey    string
	PayloadFilename     string
	PayloadContentType  string
	SendEmailToCustomer bool
}

// HandleFiscalOutbox composes mailbox entries from fiscal outbox events.
func (s *Service) HandleFiscalOutbox(ctx context.Context, tx pgx.Tx, payload []byte) error {
	var envelope messaging.CloudEvent
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return err
	}
	var data map[string]any
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		return err
	}

	docIDRaw, ok := data["document_id"].(string)
	if !ok {
		return nil
	}
	documentID, err := uuid.Parse(docIDRaw)
	if err != nil {
		return nil
	}

	doc, err := s.fiscal.GetDocument(ctx, envelope.OrganizationID, documentID)
	if err != nil {
		return err
	}

	processCode := mapFiscalEventToProcess(envelope.Type, doc)
	if processCode == "" {
		return nil
	}

	return s.composeInTx(ctx, tx, envelope.OrganizationID, doc, processCode)
}

func mapFiscalEventToProcess(eventType string, doc *FiscalDocument) string {
	switch eventType {
	case messaging.EventDocumentReceived:
		if doc.Direction == "inbound" && doc.DocumentType == "nfe" {
			return "nfe_inbound"
		}
		return ""
	case "fiscal.document.authorized.v1":
		if doc.DocumentType == "nfse" && doc.Direction == "outbound" {
			return "nfse_outbound"
		}
		if doc.DocumentType == "nfe" && doc.Direction == "outbound" {
			return "nfe_outbound"
		}
	case "fiscal.document.rejected.v1":
		if doc.DocumentType == "nfe" && doc.Direction == "outbound" {
			return "nfe_outbound_rejected"
		}
	case messaging.EventDocumentStatusChanged:
		switch doc.Status {
		case "authorized":
			if doc.DocumentType == "nfse" && doc.Direction == "outbound" {
				return "nfse_outbound"
			}
			if doc.DocumentType == "nfe" && doc.Direction == "outbound" {
				return "nfe_outbound"
			}
		case "rejected":
			if doc.DocumentType == "nfe" && doc.Direction == "outbound" {
				return "nfe_outbound_rejected"
			}
		case "cancelled":
			if doc.DocumentType == "nfe" {
				return "nfe_cancel"
			}
		}
	}
	return ""
}

func (s *Service) composeInTx(ctx context.Context, tx pgx.Tx, organizationID uuid.UUID, doc *FiscalDocument, processCode string) error {
	template, err := s.getEnabledTemplateInTx(ctx, tx, doc.OrganizationCompanyID, processCode)
	if err != nil {
		return err
	}
	if template == nil {
		return nil
	}
	if !templateHasRecipientSource(template) {
		return nil
	}

	// Idempotency: skip if message already exists.
	var exists bool
	if err := tx.QueryRow(ctx, `
		select exists(
			select 1 from organization_email_messages
			where organization_document_id = $1 and process_code = $2
		)
	`, doc.ID, processCode).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	ctxData, err := s.loadDocumentContext(ctx, organizationID, doc.ID, doc.OrganizationCompanyID)
	if err != nil {
		return err
	}

	toAddresses, err := resolveToAddresses(template, ctxData.Details, doc.Direction, ctxData.SendEmailToCustomer)
	if err != nil {
		return err
	}
	if len(toAddresses) == 0 {
		return nil
	}

	renderCtx := buildRenderContext(ctxData)
	subject := RenderTokens(template.Subject, renderCtx)
	bodyHTML := SanitizeHTML(RenderTokens(template.BodyHTML, renderCtx))
	bodyPlain := HTMLToPlain(bodyHTML)

	fromName, fromAddress, err := s.resolveFrom(ctx, organizationID, template)
	if err != nil {
		return err
	}

	orgCreds, smtpReady := s.smtpReady(ctx, organizationID)

	status := MessageNotSent
	if smtpReady {
		status = MessageRendered
	}

	now := time.Now().UTC()
	messageID := ids.New()

	_, err = tx.Exec(ctx, `
		insert into organization_email_messages (
			id, organization_id, organization_company_id, organization_document_id, template_id,
			process_code, status, from_name, from_address, to_addresses, cc_addresses,
			subject, body_html, body_plain, attempt_count, created_at, updated_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$15)
	`, messageID, organizationID, doc.OrganizationCompanyID, doc.ID, template.ID,
		processCode, status, fromName, fromAddress, toAddresses, template.CcAddresses,
		subject, bodyHTML, bodyPlain, now)
	if err != nil {
		if strings.Contains(err.Error(), "organization_email_messages") && strings.Contains(err.Error(), "unique") {
			return nil
		}
		return err
	}

	if err := s.insertAttachmentRows(ctx, tx, organizationID, messageID, template, ctxData); err != nil {
		return err
	}

	if smtpReady && orgCreds != nil {
		_, err = messaging.InsertOutboxFrom(ctx, tx, organizationID, "fiscal_saas/outbox_relay",
			"organization_email_messages", messageID, messaging.EventEmailDeliveryRequested, map[string]any{
				"message_id": messageID,
			})
		return err
	}
	return nil
}

func (s *Service) insertAttachmentRows(ctx context.Context, tx pgx.Tx, organizationID, messageID uuid.UUID, template *Template, ctxData *documentContext) error {
	now := time.Now().UTC()
	if template.AttachXML {
		available := ctxData.PayloadObjectKey != ""
		filename := ctxData.PayloadFilename
		if filename == "" && available {
			filename = "nfe.xml"
		}
		contentType := ctxData.PayloadContentType
		if contentType == "" {
			contentType = "application/xml"
		}
		var storageRef *string
		if available {
			storageRef = &ctxData.PayloadObjectKey
		}
		if _, err := tx.Exec(ctx, `
			insert into organization_email_message_attachments (
				id, organization_id, message_id, kind, filename, content_type, storage_ref, available, created_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, ids.New(), organizationID, messageID, AttachmentXML, filename, contentType, storageRef, available, now); err != nil {
			return err
		}
	}
	if template.AttachDanfeSEFAZ {
		if _, err := tx.Exec(ctx, `
			insert into organization_email_message_attachments (
				id, organization_id, message_id, kind, filename, content_type, storage_ref, available, created_at
			) values ($1,$2,$3,$4,'danfe-sefaz.pdf','application/pdf',null,false,$5)
		`, ids.New(), organizationID, messageID, AttachmentDanfeSEFAZ, now); err != nil {
			return err
		}
	}
	if template.AttachDanfeCustom {
		if _, err := tx.Exec(ctx, `
			insert into organization_email_message_attachments (
				id, organization_id, message_id, kind, filename, content_type, storage_ref, available, created_at
			) values ($1,$2,$3,$4,'danfe-personalizada.pdf','application/pdf',null,false,$5)
		`, ids.New(), organizationID, messageID, AttachmentDanfeCustom, now); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) loadDocumentContext(ctx context.Context, organizationID, documentID, companyID uuid.UUID) (*documentContext, error) {
	out := &documentContext{SendEmailToCustomer: true}
	var tradeName *string
	err := s.pool.QueryRow(ctx, `
		select legal_name, trade_name from organization_companies where id = $1 and organization_id = $2
	`, companyID, organizationID).Scan(&out.CompanyLegalName, &tradeName)
	if err != nil {
		return nil, err
	}
	if tradeName != nil {
		out.CompanyTradeName = *tradeName
	}

	var metaJSON []byte
	err = s.pool.QueryRow(ctx, `
		select access_key, series, number, issuer_cnpj, recipient_document, issued_at, metadata_json
		from organization_nfe where organization_document_id = $1
	`, documentID).Scan(&out.AccessKey, &out.Series, &out.Number, &out.IssuerCNPJ, &out.RecipientDocument, &out.IssuedAt, &metaJSON)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	nfeFound := err == nil
	if len(metaJSON) > 0 {
		_ = json.Unmarshal(metaJSON, &out.Details)
	}

	if !nfeFound {
		var takerName, takerEmail *string
		var serviceAmount *float64
		var nfseMeta []byte
		err = s.pool.QueryRow(ctx, `
			select access_key, rps_series, coalesce(nullif(nfse_number, ''), rps_number),
			       provider_cnpj, coalesce(taker_cnpj, taker_cpf), coalesce(emission_date, issued_at),
			       taker_legal_name, taker_email, service_amount, metadata_json
			from organization_nfse where organization_document_id = $1
		`, documentID).Scan(
			&out.AccessKey, &out.Series, &out.Number, &out.IssuerCNPJ, &out.RecipientDocument, &out.IssuedAt,
			&takerName, &takerEmail, &serviceAmount, &nfseMeta,
		)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		if err == nil {
			if takerName != nil {
				out.Details.Recipient.LegalName = strings.TrimSpace(*takerName)
			}
			if takerEmail != nil {
				out.Details.Recipient.Email = strings.TrimSpace(*takerEmail)
			}
			if out.RecipientDocument != "" {
				docDigits := strings.TrimSpace(out.RecipientDocument)
				if len(docDigits) == 11 {
					out.Details.Recipient.CPF = docDigits
				} else if len(docDigits) == 14 {
					out.Details.Recipient.CNPJ = docDigits
				}
			}
			out.Details.Issuer.LegalName = out.CompanyLegalName
			out.Details.Issuer.CNPJ = out.IssuerCNPJ
			if serviceAmount != nil {
				out.Details.Totals = &inbound.NFeTotals{NF: *serviceAmount}
			}
			if len(nfseMeta) > 0 {
				var meta map[string]any
				if json.Unmarshal(nfseMeta, &meta) == nil {
					if v, ok := meta["enviar_email_tomador"].(bool); ok {
						out.SendEmailToCustomer = v
					}
				}
			}
		}
	}

	err = s.pool.QueryRow(ctx, `
		select storage_object_key, content_type from organization_document_payloads
		where organization_document_id = $1 and payload_type in ('original_request', 'provider_request')
		order by case when payload_type = 'provider_request' then 0 else 1 end, created_at asc
		limit 1
	`, documentID).Scan(&out.PayloadObjectKey, &out.PayloadContentType)
	if errors.Is(err, pgx.ErrNoRows) {
		err = nil
	}
	if err != nil {
		return nil, err
	}
	if out.PayloadObjectKey != "" {
		out.PayloadFilename = "nfe.xml"
		if strings.Contains(out.PayloadContentType, "json") {
			out.PayloadFilename = "document.json"
		}
		if out.AccessKey != "" {
			out.PayloadFilename = out.AccessKey + ".xml"
		}
	}
	return out, nil
}

func buildRenderContext(d *documentContext) RenderContext {
	recipientName := d.Details.Recipient.LegalName
	if recipientName == "" {
		recipientName = d.Details.Recipient.TradeName
	}
	issuerName := d.Details.Issuer.LegalName
	if issuerName == "" {
		issuerName = d.Details.Issuer.TradeName
	}
	empresaNome := d.CompanyTradeName
	if empresaNome == "" {
		empresaNome = d.CompanyLegalName
	}
	valor := ""
	if d.Details.Totals != nil {
		valor = FormatMoney(d.Details.Totals.NF)
	}
	return RenderContext{
		ClientName:        recipientName,
		DestinatarioNome:  recipientName,
		DestinatarioCnpj:  d.RecipientDocument,
		DestinatarioEmail: strings.TrimSpace(d.Details.Recipient.Email),
		EmitenteNome:      issuerName,
		EmitenteCnpj:      d.IssuerCNPJ,
		Numero:            d.Number,
		Serie:             d.Series,
		Chave:             d.AccessKey,
		Valor:             valor,
		DataEmissao:       FormatIssuedAt(d.IssuedAt),
		EmpresaNome:       empresaNome,
		NaturezaOperacao:  d.Details.NatureOfOperation,
	}
}

func (s *Service) resolveFrom(ctx context.Context, organizationID uuid.UUID, template *Template) (string, string, error) {
	creds, err := s.GetCredentials(ctx, organizationID)
	if err != nil {
		return "", "", err
	}
	fromName := creds.FromName
	fromAddress := creds.FromAddress
	if template.FromName != nil && strings.TrimSpace(*template.FromName) != "" {
		fromName = strings.TrimSpace(*template.FromName)
	}
	if template.FromAddress != nil && strings.TrimSpace(*template.FromAddress) != "" {
		fromAddress = strings.TrimSpace(*template.FromAddress)
	}
	if fromAddress == "" {
		fromAddress = "noreply@example.com"
	}
	return fromName, fromAddress, nil
}

func (s *Service) smtpReady(ctx context.Context, organizationID uuid.UUID) (*loadedCredentials, bool) {
	creds, err := s.loadActiveCredentials(ctx, organizationID)
	if err != nil {
		return nil, false
	}
	return creds, true
}

func (s *Service) getEnabledTemplateInTx(ctx context.Context, tx pgx.Tx, companyID uuid.UUID, processCode string) (*Template, error) {
	row := tx.QueryRow(ctx, `
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
	return &t, nil
}

// DeliverMessage sends a composed message via organization SMTP.
func (s *Service) DeliverMessage(ctx context.Context, organizationID, messageID uuid.UUID) error {
	msg, err := s.GetMessage(ctx, organizationID, messageID)
	if err != nil {
		return err
	}
	if msg.Status == MessageSent {
		return nil
	}

	creds, err := s.loadActiveCredentials(ctx, organizationID)
	if err != nil {
		return s.markDeliveryFailed(ctx, messageID, err.Error(), MessageNotSent)
	}

	mailerMsg, err := s.buildMailerMessage(ctx, msg)
	if err != nil {
		return err
	}

	sender := mailer.NewSMTPSender(creds.smtpConfig())
	if err := sender.Send(ctx, mailerMsg); err != nil {
		return s.markDeliveryFailed(ctx, messageID, err.Error(), MessageFailed)
	}

	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		update organization_email_messages
		set status = $2, sent_at = $3, attempt_count = attempt_count + 1, last_error = null, updated_at = $3
		where id = $1
	`, messageID, MessageSent, now)
	return err
}

func (s *Service) markDeliveryFailed(ctx context.Context, messageID uuid.UUID, errMsg string, status string) error {
	now := time.Now().UTC()
	_, err := s.pool.Exec(ctx, `
		update organization_email_messages
		set status = $2, attempt_count = attempt_count + 1, last_error = $3, updated_at = $4
		where id = $1
	`, messageID, status, errMsg, now)
	return err
}

func (s *Service) buildMailerMessage(ctx context.Context, msg *Message) (mailer.Message, error) {
	from, err := mailer.ParseFrom(formatFromLine(msg.FromName, msg.FromAddress))
	if err != nil {
		return mailer.Message{}, domainerr.Validation("invalid_from", err.Error())
	}
	m := mailer.Message{
		From:      from,
		To:        msg.ToAddresses,
		Cc:        msg.CcAddresses,
		Subject:   msg.Subject,
		PlainBody: msg.BodyPlain,
		HTMLBody:  msg.BodyHTML,
	}
	for _, att := range msg.Attachments {
		if !att.Available {
			continue
		}
		data, filename, contentType, err := s.DownloadAttachment(ctx, msg.OrganizationID, msg.ID, att.ID)
		if err != nil {
			continue
		}
		m.Attachments = append(m.Attachments, mailer.Attachment{
			Filename:    filename,
			ContentType: contentType,
			Data:        data,
		})
	}
	return m, nil
}

func formatFromLine(name, address string) string {
	if name != "" {
		return name + " <" + address + ">"
	}
	return address
}

// HandleDeliveryOutbox sends email from delivery_requested outbox event.
func (s *Service) HandleDeliveryOutbox(ctx context.Context, organizationID uuid.UUID, payload []byte) error {
	var envelope messaging.CloudEvent
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return err
	}
	var data map[string]any
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		return err
	}
	raw, ok := data["message_id"].(string)
	if !ok {
		return nil
	}
	messageID, err := uuid.Parse(raw)
	if err != nil {
		return nil
	}
	return s.DeliverMessage(ctx, organizationID, messageID)
}
