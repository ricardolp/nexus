-- One row per outbound NF-e: company + environment + model + series + number.
-- SAP resends of the same note (with a different payload hash) used to create
-- new documents; they now update and resubmit the existing one.
alter table organization_documents
    add column if not exists natural_key text;

update organization_documents d
set natural_key = 'nfe:55:'
    || coalesce(nullif(ltrim(trim(n.series), '0'), ''), '0')
    || ':'
    || ltrim(trim(n.number), '0')
from organization_nfe n
where n.organization_document_id = d.id
  and d.document_type = 'nfe'
  and d.direction = 'outbound'
  and d.idempotency_key not like 'sefaz_status_consult:%'
  and d.natural_key is null
  and nullif(ltrim(trim(coalesce(n.number, '')), '0'), '') is not null;

-- Keep the authorized/finalized row when there is one, otherwise the latest.
drop table if exists tmp_outbound_nfe_duplicates;
create temporary table tmp_outbound_nfe_duplicates as
select id, organization_id, idempotency_key
from (
    select d.id, d.organization_id, d.idempotency_key,
           row_number() over (
               partition by d.organization_id, d.organization_company_id, d.environment, d.natural_key
               order by
                   case when d.status in ('authorized', 'correction_registered', 'cancel_requested', 'cancelled', 'inutilized') then 0 else 1 end,
                   d.received_at desc,
                   d.created_at desc
           ) as rn
    from organization_documents d
    where d.natural_key is not null
) ranked
where rn > 1;

update fiscal_document_query_items
set document_id = null
where document_id in (select id from tmp_outbound_nfe_duplicates);

delete from idempotency_records r
using tmp_outbound_nfe_duplicates t
where r.organization_id = t.organization_id
  and r.scope = 'fiscal_documents'
  and r.idempotency_key = t.idempotency_key;

delete from organization_documents
where id in (select id from tmp_outbound_nfe_duplicates);

drop table tmp_outbound_nfe_duplicates;

create unique index if not exists uq_organization_documents_outbound_natural_key
    on organization_documents (organization_id, organization_company_id, environment, natural_key)
    where natural_key is not null;

-- down
-- drop index if exists uq_organization_documents_outbound_natural_key;
-- alter table organization_documents drop column if exists natural_key;
