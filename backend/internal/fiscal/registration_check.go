package fiscal

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	IssuedBeforeRegistrationCode    = "issued_before_registration"
	IssuedBeforeRegistrationMessage = "A nota não pode ser enviada: a data de emissão é anterior ao cadastro do cliente."
)

// IssuedBeforeRegistration reports whether the note's emission calendar date
// is strictly before the company's registration calendar date in Brazil.
// issueDate is a calendar date (midnight UTC, as scanned from a SQL date).
// registeredAt is the company created_at timestamp.
// The same calendar day is allowed. A zero issue date does not block.
func IssuedBeforeRegistration(issueDate, registeredAt time.Time) bool {
	if issueDate.IsZero() || registeredAt.IsZero() {
		return false
	}
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		loc = time.FixedZone("BRT", -3*60*60)
	}
	iy, im, id := issueDate.UTC().Date()
	ry, rm, rd := registeredAt.In(loc).Date()
	if iy != ry {
		return iy < ry
	}
	if im != rm {
		return im < rm
	}
	return id < rd
}

// RegistrationBlock stops transmission when the note was issued before the
// company was registered. A database failure is returned as err. A blocked
// note returns a code and a message safe to show on the document.
func (s *Service) RegistrationBlock(ctx context.Context, organizationID, documentID uuid.UUID) (code, message string, err error) {
	var registered time.Time
	var issue *time.Time
	err = s.pool.QueryRow(ctx, `
		select c.created_at,
		       coalesce(
		           n.emission_date,
		           (n.issued_at at time zone 'America/Sao_Paulo')::date,
		           (s.emission_date at time zone 'America/Sao_Paulo')::date
		       )
		from organization_documents d
		join organization_companies c
		  on c.organization_id = d.organization_id
		 and c.id = d.organization_company_id
		left join organization_nfe n
		  on n.organization_id = d.organization_id
		 and n.organization_document_id = d.id
		left join organization_nfse s
		  on s.organization_id = d.organization_id
		 and s.organization_document_id = d.id
		where d.organization_id = $1 and d.id = $2
	`, organizationID, documentID).Scan(&registered, &issue)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	if err != nil {
		return "", "", err
	}
	if issue == nil || !IssuedBeforeRegistration(*issue, registered) {
		return "", "", nil
	}
	return IssuedBeforeRegistrationCode, IssuedBeforeRegistrationMessage, nil
}
