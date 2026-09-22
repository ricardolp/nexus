package email

import (
	"strings"

	"github.com/nexus/fiscal-messaging/internal/inbound"
)

// resolveToAddresses merges manual chips with auto-resolved addresses from the NFe.
// When sendToCustomer is false, partner/recipient auto addresses are skipped
// (company template ToAddresses still apply).
func resolveToAddresses(template *Template, details inbound.NFeDetails, direction string, sendToCustomer bool) ([]string, error) {
	raw := append([]string{}, template.ToAddresses...)
	if sendToCustomer {
		if template.UseRecipientEmail {
			if e := strings.TrimSpace(details.Recipient.Email); e != "" {
				raw = append(raw, e)
			}
		}
		if template.UsePartnerEmail {
			if e := partnerEmail(details, direction); e != "" {
				raw = append(raw, e)
			}
		}
	}
	if len(raw) == 0 {
		return nil, nil
	}
	return NormalizeAddresses(raw)
}

// partnerEmail is the counterparty business partner e-mail.
// inbound: emitente (fornecedor); outbound: destinatário (cliente) until SAP BP email exists.
func partnerEmail(details inbound.NFeDetails, direction string) string {
	if direction == "inbound" {
		return strings.TrimSpace(details.Issuer.Email)
	}
	return strings.TrimSpace(details.Recipient.Email)
}

func templateHasRecipientSource(template *Template) bool {
	return len(template.ToAddresses) > 0 || template.UsePartnerEmail || template.UseRecipientEmail
}
