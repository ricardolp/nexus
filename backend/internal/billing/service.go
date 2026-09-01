package billing

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
)

type Service struct {
	pool *db.Pool
	orgs *organization.Service
}

func NewService(pool *db.Pool, orgs *organization.Service) *Service {
	return &Service{pool: pool, orgs: orgs}
}

func (s *Service) GetStatement(ctx context.Context, organizationID uuid.UUID, fromDate, toDate string, now time.Time) (*Statement, error) {
	from, toExclusive, err := ParsePeriod(fromDate, toDate, now)
	if err != nil {
		return nil, err
	}

	org, err := s.orgs.GetOrganization(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	companies, err := s.orgs.ListCompanies(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	rows, err := s.queryUsage(ctx, organizationID, from, toExclusive)
	if err != nil {
		return nil, err
	}

	return assembleStatement(org, companies, rows, from, toExclusive, now), nil
}

func (s *Service) queryUsage(ctx context.Context, organizationID uuid.UUID, from, toExclusive time.Time) ([]usageRow, error) {
	const q = `
		select company_id, code, sum(quantity)::bigint
		from (
			select
				d.organization_company_id as company_id,
				case
					when d.document_type = 'nfe' and d.direction = 'outbound' then 'nfe_outbound'
					when d.document_type = 'nfe' and d.direction = 'inbound' and lower(coalesce(d.source_system, '')) = 'manual_upload' then 'nfe_inbound_xml'
					when d.document_type = 'nfe' and d.direction = 'inbound' and (
						lower(coalesce(d.source_system, '')) in ('nfe_gateway_distribution', '')
						or d.source_system ilike 'nfe_gateway%'
					) then 'nfe_inbound_sefaz'
					when d.document_type = 'nfe' and d.direction = 'inbound' then 'nfe_inbound_other'
					when d.document_type = 'nfse' and d.direction = 'outbound' then 'nfse_outbound'
					when d.document_type = 'nfse' and d.direction = 'inbound' then 'nfse_inbound'
					else 'other'
				end as code,
				count(*)::bigint as quantity
			from organization_documents d
			where d.organization_id = $1
			  and d.created_at >= $2
			  and d.created_at < $3
			group by 1, 2

			union all

			select
				d.organization_company_id,
				case
					when e.event_type ilike '%cancel%' then 'nfe_cancel'
					when e.event_type ilike '%correction%'
					  or e.event_type ilike '%carta%'
					  or e.event_type ilike '%cce%' then 'nfe_correction_letter'
					when (e.event_type = 'manifestacao' or e.event_type ilike '%manifest%')
					  and e.metadata_json->>'manifestation_type' = 'confirmacao_da_operacao' then 'nfe_operation_accept'
					when (e.event_type = 'manifestacao' or e.event_type ilike '%manifest%')
					  and e.metadata_json->>'manifestation_type' = 'operacao_nao_realizada' then 'nfe_operation_reject'
					when (e.event_type = 'manifestacao' or e.event_type ilike '%manifest%')
					  and e.metadata_json->>'manifestation_type' = 'ciencia_da_operacao' then 'nfe_operation_science'
					when (e.event_type = 'manifestacao' or e.event_type ilike '%manifest%')
					  and e.metadata_json->>'manifestation_type' = 'desconhecimento_da_operacao' then 'nfe_operation_unknown'
					else null
				end,
				count(*)::bigint
			from organization_document_events e
			join organization_documents d on d.id = e.organization_document_id
			where e.organization_id = $1
			  and e.occurred_at >= $2
			  and e.occurred_at < $3
			group by 1, 2

			union all

			select
				r.organization_company_id,
				'nfe_operation_science',
				count(*)::bigint
			from nfe_manifestation_requests r
			where r.organization_id = $1
			  and r.created_at >= $2
			  and r.created_at < $3
			group by 1
		) u
		where code is not null
		group by company_id, code
	`

	queryRows, err := s.pool.Query(ctx, q, organizationID, from, toExclusive)
	if err != nil {
		return nil, err
	}
	defer queryRows.Close()

	var out []usageRow
	for queryRows.Next() {
		var row usageRow
		if err := queryRows.Scan(&row.CompanyID, &row.Code, &row.Quantity); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, queryRows.Err()
}

func assembleStatement(
	org *organization.Organization,
	companies []organization.Company,
	rows []usageRow,
	from, toExclusive, now time.Time,
) *Statement {
	byCompany := map[uuid.UUID]map[string]int64{}
	totals := map[string]int64{}
	for _, row := range rows {
		if row.Quantity == 0 {
			continue
		}
		if byCompany[row.CompanyID] == nil {
			byCompany[row.CompanyID] = map[string]int64{}
		}
		byCompany[row.CompanyID][row.Code] += row.Quantity
		totals[row.Code] += row.Quantity
	}

	stmt := &Statement{
		OrganizationID: org.ID,
		LegalName:      org.LegalName,
		TradeName:      org.TradeName,
		Slug:           org.Slug,
		TaxIdentifier:  org.TaxIdentifier,
		Timezone:       org.Timezone,
		PeriodFrom:     from,
		PeriodTo:       PeriodEndInclusive(toExclusive),
		IssuedAt:       now.UTC(),
		Totals:         metricsFromCounts(totals, true),
		Companies:      make([]CompanyStatement, 0, len(companies)),
		Issuer:         NovaConsulting,
	}

	sorted := append([]organization.Company(nil), companies...)
	sort.Slice(sorted, func(i, j int) bool {
		return strings.ToLower(sorted[i].LegalName) < strings.ToLower(sorted[j].LegalName)
	})

	for _, c := range sorted {
		counts := byCompany[c.ID]
		if counts == nil {
			counts = map[string]int64{}
		}
		metrics := metricsFromCounts(counts, true)
		var total int64
		for _, m := range metrics {
			total += m.Quantity
		}
		stmt.Companies = append(stmt.Companies, CompanyStatement{
			CompanyID:     c.ID,
			LegalName:     c.LegalName,
			TradeName:     c.TradeName,
			CNPJ:          c.CNPJ,
			TotalQuantity: total,
			Metrics:       metrics,
		})
	}

	for _, m := range stmt.Totals {
		stmt.TotalQuantity += m.Quantity
	}
	return stmt
}

func metricsFromCounts(counts map[string]int64, includeAlways bool) []MetricQuantity {
	seen := map[string]bool{}
	out := make([]MetricQuantity, 0, len(Catalog))
	for _, def := range Catalog {
		qty := counts[def.Code]
		if qty == 0 && (!includeAlways || !def.AlwaysShow) {
			continue
		}
		out = append(out, MetricQuantity{
			Code: def.Code, Label: def.Label, Unit: UnitMessage, Quantity: qty,
		})
		seen[def.Code] = true
	}
	var extras []MetricQuantity
	for code, qty := range counts {
		if seen[code] || qty == 0 {
			continue
		}
		def := metricByCode(code)
		extras = append(extras, MetricQuantity{
			Code: def.Code, Label: def.Label, Unit: UnitMessage, Quantity: qty,
		})
	}
	sort.Slice(extras, func(i, j int) bool { return extras[i].Label < extras[j].Label })
	return append(out, extras...)
}

func statementFilename(stmt *Statement) string {
	from := stmt.PeriodFrom.In(billingLocation()).Format("02.Jan.06")
	to := stmt.PeriodTo.In(billingLocation()).Format("02.Jan.06")
	slug := stmt.Slug
	if slug == "" {
		slug = stmt.OrganizationID.String()
	}
	return "Nexus_Extrato_" + slug + "_" + from + "_" + to + ".pdf"
}
