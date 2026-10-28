package faq

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type Service struct {
	pool *db.Pool
}

func NewService(pool *db.Pool) *Service {
	return &Service{pool: pool}
}

var (
	validSources = map[string]struct{}{
		SourceSEFAZ: {}, SourceSAP: {}, SourceAPI: {}, SourceNEXUS: {},
	}
	validSeverities = map[string]struct{}{
		SeverityDenied: {}, SeverityRejected: {}, SeverityTechnical: {}, SeverityUnknown: {},
	}
	validActions = map[string]struct{}{
		ActionReverseSource: {}, ActionResetAndResend: {}, ActionWaitRetry: {},
		ActionContactSupport: {}, ActionNone: {},
	}
)

func clampLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}

func normalizeSource(raw string) (string, error) {
	s := strings.ToUpper(strings.TrimSpace(raw))
	if _, ok := validSources[s]; !ok {
		return "", domainerr.Validation("invalid_source", "source must be SEFAZ, SAP, API, or NEXUS")
	}
	return s, nil
}

func normalizeSeverity(raw string) (string, error) {
	s := strings.ToUpper(strings.TrimSpace(raw))
	if _, ok := validSeverities[s]; !ok {
		return "", domainerr.Validation("invalid_severity", "severity must be DENIED, REJECTED, TECHNICAL, or UNKNOWN")
	}
	return s, nil
}

func normalizeAction(raw string) (string, error) {
	s := strings.ToUpper(strings.TrimSpace(raw))
	if s == "" {
		s = ActionNone
	}
	if _, ok := validActions[s]; !ok {
		return "", domainerr.Validation("invalid_recommended_action", "recommended_action is invalid")
	}
	return s, nil
}

func normalizeDocsta(raw string) string {
	return strings.TrimSpace(raw)
}

func normalizeLang(raw string) string {
	lang := strings.ToUpper(strings.TrimSpace(raw))
	if lang == "" {
		return DefaultLang
	}
	return lang
}

func normalizeCode(raw string) (string, error) {
	code := strings.TrimSpace(raw)
	if code == "" {
		return "", domainerr.Validation("invalid_code", "code is required")
	}
	return code, nil
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}

func emptyNotNil(ss []string) []string {
	if ss == nil {
		return []string{}
	}
	out := make([]string, 0, len(ss))
	for _, item := range ss {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}

func (s *Service) Lookup(ctx context.Context, in LookupInput) (*LookupResult, error) {
	source, err := normalizeSource(in.Source)
	if err != nil {
		return nil, err
	}
	code, err := normalizeCode(in.Code)
	if err != nil {
		return nil, err
	}
	docsta := normalizeDocsta(in.Docsta)
	lang := normalizeLang(in.Lang)
	message := truncateRunes(strings.TrimSpace(in.Message), 500)

	msg, err := s.findArticle(ctx, source, code, docsta, lang)
	if err != nil {
		return nil, err
	}

	found := msg != nil
	_ = s.recordHit(ctx, HitRecord{
		OrganizationID:   in.OrganizationID,
		Source:           source,
		Code:             code,
		Docsta:           docsta,
		Found:            found,
		Docnum:           strings.TrimSpace(in.Docnum),
		Model:            strings.TrimSpace(in.Model),
		MessageTruncated: message,
	})

	return buildLookupResult(source, code, docsta, message, msg), nil
}

type HitRecord struct {
	OrganizationID   uuid.UUID
	Source           string
	Code             string
	Docsta           string
	Found            bool
	Docnum           string
	Model            string
	MessageTruncated string
}

func (s *Service) findArticle(ctx context.Context, source, code, docsta, lang string) (*Message, error) {
	if docsta != "" {
		if msg, err := s.getActiveMessage(ctx, source, code, docsta, lang); err != nil {
			return nil, err
		} else if msg != nil {
			return msg, nil
		}
	}
	if msg, err := s.getActiveMessage(ctx, source, code, "", lang); err != nil {
		return nil, err
	} else if msg != nil {
		return msg, nil
	}
	if docsta != "" && code != GenericCode {
		if msg, err := s.getActiveMessage(ctx, source, GenericCode, docsta, lang); err != nil {
			return nil, err
		} else if msg != nil {
			return msg, nil
		}
	}
	return nil, nil
}

func (s *Service) getActiveMessage(ctx context.Context, source, code, docsta, lang string) (*Message, error) {
	row := s.pool.QueryRow(ctx, `
		select `+messageColumns+`
		from faq_messages
		where source = $1 and code = $2 and docsta = $3 and lang = $4 and active = true
	`, source, code, docsta, lang)
	msg, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &msg, nil
}

func buildLookupResult(source, code, docsta, message string, msg *Message) *LookupResult {
	out := &LookupResult{
		Found:             false,
		Source:            source,
		Code:              code,
		Severity:          SeverityUnknown,
		Title:             nil,
		Summary:           nil,
		Steps:             []string{},
		ForbiddenActions:  []string{},
		RecommendedAction: ActionNone,
		FAQURL:            nil,
		UpdatedAt:         nil,
	}
	if docsta != "" {
		d := docsta
		out.Docsta = &d
	}
	if message != "" {
		m := message
		out.SefazText = &m
	}
	if msg == nil {
		return out
	}

	title := msg.Title
	summary := msg.Summary
	updated := msg.UpdatedAt.UTC()
	out.Found = true
	out.Severity = msg.Severity
	out.Title = &title
	out.Summary = &summary
	out.Steps = emptyNotNil(msg.Steps)
	out.ForbiddenActions = emptyNotNil(msg.ForbiddenActions)
	out.RecommendedAction = msg.RecommendedAction
	out.UpdatedAt = &updated
	if msg.Docsta != "" {
		d := msg.Docsta
		out.Docsta = &d
	}
	if msg.FAQSlug != nil && strings.TrimSpace(*msg.FAQSlug) != "" {
		slug := strings.TrimSpace(*msg.FAQSlug)
		url := "/faq/" + strings.ToLower(msg.Source) + "/" + slug
		out.FAQURL = &url
	}
	return out
}

func (s *Service) recordHit(ctx context.Context, hit HitRecord) error {
	if hit.OrganizationID == uuid.Nil {
		return nil
	}
	var docnum, model, msg *string
	if hit.Docnum != "" {
		docnum = &hit.Docnum
	}
	if hit.Model != "" {
		model = &hit.Model
	}
	if hit.MessageTruncated != "" {
		msg = &hit.MessageTruncated
	}
	_, err := s.pool.Exec(ctx, `
		insert into faq_hits (
			id, organization_id, source, code, docsta, found, docnum, model, message_truncated, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`, ids.New(), hit.OrganizationID, hit.Source, hit.Code, hit.Docsta, hit.Found, docnum, model, msg, time.Now().UTC())
	return err
}

const messageColumns = `
	id, source, code, docsta, lang, severity, title, summary,
	steps, forbidden_actions, recommended_action, faq_slug, active, created_at, updated_at
`

type messageScannable interface {
	Scan(dest ...any) error
}

func scanMessage(row messageScannable) (Message, error) {
	var m Message
	var stepsRaw, forbiddenRaw []byte
	var slug *string
	err := row.Scan(
		&m.ID, &m.Source, &m.Code, &m.Docsta, &m.Lang, &m.Severity, &m.Title, &m.Summary,
		&stepsRaw, &forbiddenRaw, &m.RecommendedAction, &slug, &m.Active, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return Message{}, err
	}
	m.Steps = decodeStringArray(stepsRaw)
	m.ForbiddenActions = decodeStringArray(forbiddenRaw)
	m.FAQSlug = slug
	return m, nil
}

func decodeStringArray(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return emptyNotNil(out)
}

func encodeStringArray(ss []string) ([]byte, error) {
	return json.Marshal(emptyNotNil(ss))
}

func (s *Service) ListMessages(ctx context.Context, in ListMessagesInput) ([]Message, error) {
	limit := clampLimit(in.Limit)
	args := []any{}
	where := []string{"1=1"}
	argN := 1

	if src := strings.TrimSpace(in.Source); src != "" {
		source, err := normalizeSource(src)
		if err != nil {
			return nil, err
		}
		where = append(where, fmt.Sprintf("source = $%d", argN))
		args = append(args, source)
		argN++
	}
	if code := strings.TrimSpace(in.Code); code != "" {
		where = append(where, fmt.Sprintf("code = $%d", argN))
		args = append(args, code)
		argN++
	}
	if q := strings.TrimSpace(in.Q); q != "" {
		where = append(where, fmt.Sprintf("(title ilike $%d or summary ilike $%d or code ilike $%d)", argN, argN, argN))
		args = append(args, "%"+q+"%")
		argN++
	}
	if in.Active != nil {
		where = append(where, fmt.Sprintf("active = $%d", argN))
		args = append(args, *in.Active)
		argN++
	}

	args = append(args, limit)
	query := fmt.Sprintf(`
		select %s
		from faq_messages
		where %s
		order by source, code, docsta, lang
		limit $%d
	`, messageColumns, strings.Join(where, " and "), argN)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Message, 0)
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, msg)
	}
	return items, rows.Err()
}

func (s *Service) GetMessage(ctx context.Context, id uuid.UUID) (*Message, error) {
	row := s.pool.QueryRow(ctx, `
		select `+messageColumns+`
		from faq_messages
		where id = $1
	`, id)
	msg, err := scanMessage(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("faq_message_not_found", "FAQ message not found")
		}
		return nil, err
	}
	return &msg, nil
}

func (s *Service) CreateMessage(ctx context.Context, in CreateMessageInput) (*Message, error) {
	msg, err := buildMessageFromInput(in.Source, in.Code, in.Docsta, in.Lang, in.Severity, in.Title, in.Summary,
		in.Steps, in.ForbiddenActions, in.RecommendedAction, in.FAQSlug, in.Active)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	msg.ID = ids.New()
	msg.CreatedAt = now
	msg.UpdatedAt = now

	stepsJSON, err := encodeStringArray(msg.Steps)
	if err != nil {
		return nil, err
	}
	forbiddenJSON, err := encodeStringArray(msg.ForbiddenActions)
	if err != nil {
		return nil, err
	}

	_, err = s.pool.Exec(ctx, `
		insert into faq_messages (
			id, source, code, docsta, lang, severity, title, summary,
			steps, forbidden_actions, recommended_action, faq_slug, active, created_at, updated_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
	`, msg.ID, msg.Source, msg.Code, msg.Docsta, msg.Lang, msg.Severity, msg.Title, msg.Summary,
		stepsJSON, forbiddenJSON, msg.RecommendedAction, msg.FAQSlug, msg.Active, msg.CreatedAt, msg.UpdatedAt)
	if err != nil {
		return nil, mapUniqueConflict(err)
	}
	return msg, nil
}

func (s *Service) UpdateMessage(ctx context.Context, id uuid.UUID, in UpdateMessageInput) (*Message, error) {
	existing, err := s.GetMessage(ctx, id)
	if err != nil {
		return nil, err
	}
	msg, err := buildMessageFromInput(in.Source, in.Code, in.Docsta, in.Lang, in.Severity, in.Title, in.Summary,
		in.Steps, in.ForbiddenActions, in.RecommendedAction, in.FAQSlug, in.Active)
	if err != nil {
		return nil, err
	}
	msg.ID = existing.ID
	msg.CreatedAt = existing.CreatedAt
	msg.UpdatedAt = time.Now().UTC()

	stepsJSON, err := encodeStringArray(msg.Steps)
	if err != nil {
		return nil, err
	}
	forbiddenJSON, err := encodeStringArray(msg.ForbiddenActions)
	if err != nil {
		return nil, err
	}

	tag, err := s.pool.Exec(ctx, `
		update faq_messages set
			source = $2, code = $3, docsta = $4, lang = $5, severity = $6,
			title = $7, summary = $8, steps = $9, forbidden_actions = $10,
			recommended_action = $11, faq_slug = $12, active = $13, updated_at = $14
		where id = $1
	`, id, msg.Source, msg.Code, msg.Docsta, msg.Lang, msg.Severity, msg.Title, msg.Summary,
		stepsJSON, forbiddenJSON, msg.RecommendedAction, msg.FAQSlug, msg.Active, msg.UpdatedAt)
	if err != nil {
		return nil, mapUniqueConflict(err)
	}
	if tag.RowsAffected() == 0 {
		return nil, domainerr.NotFound("faq_message_not_found", "FAQ message not found")
	}
	return msg, nil
}

func (s *Service) SetMessageActive(ctx context.Context, id uuid.UUID, active bool) (*Message, error) {
	tag, err := s.pool.Exec(ctx, `
		update faq_messages set active = $2, updated_at = $3 where id = $1
	`, id, active, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, domainerr.NotFound("faq_message_not_found", "FAQ message not found")
	}
	return s.GetMessage(ctx, id)
}

func buildMessageFromInput(
	source, code, docsta, lang, severity, title, summary string,
	steps, forbidden []string, action string, slug *string, active *bool,
) (*Message, error) {
	normSource, err := normalizeSource(source)
	if err != nil {
		return nil, err
	}
	normCode, err := normalizeCode(code)
	if err != nil {
		return nil, err
	}
	normSeverity, err := normalizeSeverity(severity)
	if err != nil {
		return nil, err
	}
	normAction, err := normalizeAction(action)
	if err != nil {
		return nil, err
	}
	title = strings.TrimSpace(title)
	summary = strings.TrimSpace(summary)
	if title == "" {
		return nil, domainerr.Validation("invalid_title", "title is required")
	}
	if summary == "" {
		return nil, domainerr.Validation("invalid_summary", "summary is required")
	}
	var faqSlug *string
	if slug != nil {
		v := strings.TrimSpace(*slug)
		if v != "" {
			faqSlug = &v
		}
	}
	isActive := true
	if active != nil {
		isActive = *active
	}
	return &Message{
		Source:            normSource,
		Code:              normCode,
		Docsta:            normalizeDocsta(docsta),
		Lang:              normalizeLang(lang),
		Severity:          normSeverity,
		Title:             title,
		Summary:           summary,
		Steps:             emptyNotNil(steps),
		ForbiddenActions:  emptyNotNil(forbidden),
		RecommendedAction: normAction,
		FAQSlug:           faqSlug,
		Active:            isActive,
	}, nil
}

func mapUniqueConflict(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return domainerr.Conflict("faq_message_conflict", "A FAQ message with the same source, code, docsta and lang already exists")
	}
	return err
}

func (s *Service) ListMissingHits(ctx context.Context, in ListHitsInput) ([]MissingHit, error) {
	limit := clampLimit(in.Limit)
	args := []any{}
	where := []string{"found = false"}
	argN := 1
	if in.OrganizationID != nil {
		where = append(where, fmt.Sprintf("organization_id = $%d", argN))
		args = append(args, *in.OrganizationID)
		argN++
	}
	args = append(args, limit)
	query := fmt.Sprintf(`
		select source, code, docsta, count(*)::bigint as count, max(created_at) as last_seen
		from faq_hits
		where %s
		group by source, code, docsta
		order by count desc, last_seen desc
		limit $%d
	`, strings.Join(where, " and "), argN)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]MissingHit, 0)
	for rows.Next() {
		var h MissingHit
		if err := rows.Scan(&h.Source, &h.Code, &h.Docsta, &h.Count, &h.LastSeen); err != nil {
			return nil, err
		}
		items = append(items, h)
	}
	return items, rows.Err()
}

func (s *Service) ListTopHits(ctx context.Context, in ListHitsInput) ([]TopHit, error) {
	limit := clampLimit(in.Limit)
	args := []any{}
	where := []string{"1=1"}
	argN := 1
	if in.OrganizationID != nil {
		where = append(where, fmt.Sprintf("organization_id = $%d", argN))
		args = append(args, *in.OrganizationID)
		argN++
	}
	args = append(args, limit)
	query := fmt.Sprintf(`
		select source, code, docsta,
		       count(*)::bigint as count,
		       count(*) filter (where found)::bigint as found_count,
		       count(*) filter (where not found)::bigint as missing_count,
		       max(created_at) as last_seen
		from faq_hits
		where %s
		group by source, code, docsta
		order by count desc, last_seen desc
		limit $%d
	`, strings.Join(where, " and "), argN)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TopHit, 0)
	for rows.Next() {
		var h TopHit
		if err := rows.Scan(&h.Source, &h.Code, &h.Docsta, &h.Count, &h.FoundCount, &h.MissingCount, &h.LastSeen); err != nil {
			return nil, err
		}
		if in.OrganizationID != nil {
			h.OrganizationID = in.OrganizationID
		}
		items = append(items, h)
	}
	return items, rows.Err()
}
