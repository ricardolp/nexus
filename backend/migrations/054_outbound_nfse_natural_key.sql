-- One row per outbound NFS-e: company + environment + RPS series + number.
-- SAP resends of the same note used to create new documents; they now update
-- and resubmit the existing one. The unique index already exists from 053.
-- Duplicates are removed before natural_key is written so the index holds.

drop table if exists tmp_outbound_nfse_keys;
create temporary table tmp_outbound_nfse_keys as
select d.id,
       d.organization_id,
       d.organization_company_id,
       d.environment,
       d.idempotency_key,
       d.status,
       d.received_at,
       d.created_at,
       'nfse:'
           || coalesce(nullif(ltrim(trim(n.rps_series), '0'), ''), '0')
           || ':'
           || ltrim(trim(n.rps_number), '0') as natural_key
from organization_documents d
join organization_nfse n on n.organization_document_id = d.id
where d.document_type = 'nfse'
  and d.direction = 'outbound'
  and d.natural_key is null
  and nullif(ltrim(trim(coalesce(n.rps_number, '')), '0'), '') is not null;

drop table if exists tmp_outbound_nfse_duplicates;
create temporary table tmp_outbound_nfse_duplicates as
select id, organization_id, idempotency_key
from (
    select id, organization_id, idempotency_key,
           row_number() over (
               partition by organization_id, organization_company_id, environment, natural_key
               order by
                   case when status in ('authorized', 'correction_registered', 'cancel_requested', 'cancelled', 'inutilized') then 0 else 1 end,
                   received_at desc,
                   created_at desc
           ) as rn
    from tmp_outbound_nfse_keys
) ranked
where rn > 1;

insert into tmp_outbound_nfse_duplicates (id, organization_id, idempotency_key)
select k.id, k.organization_id, k.idempotency_key
from tmp_outbound_nfse_keys k
join organization_documents d
  on d.organization_id = k.organization_id
 and d.organization_company_id = k.organization_company_id
 and d.environment = k.environment
 and d.natural_key = k.natural_key
 and d.id <> k.id
where not exists (
    select 1 from tmp_outbound_nfse_duplicates t where t.id = k.id
);

update fiscal_document_query_items
set document_id = null
where document_id in (select id from tmp_outbound_nfse_duplicates);

delete from idempotency_records r
using tmp_outbound_nfse_duplicates t
where r.organization_id = t.organization_id
  and r.scope = 'fiscal_documents'
  and r.idempotency_key = t.idempotency_key;

delete from organization_documents
where id in (select id from tmp_outbound_nfse_duplicates);

update organization_documents d
set natural_key = k.natural_key
from tmp_outbound_nfse_keys k
where d.id = k.id
  and not exists (
      select 1 from tmp_outbound_nfse_duplicates t where t.id = d.id
  );

drop table tmp_outbound_nfse_duplicates;
drop table tmp_outbound_nfse_keys;

-- down
-- update organization_documents
-- set natural_key = null
-- where document_type = 'nfse' and direction = 'outbound' and natural_key like 'nfse:%';
