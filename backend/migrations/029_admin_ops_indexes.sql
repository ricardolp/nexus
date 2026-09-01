-- +migrate Up

-- Indexes for platform admin ops console (request traces + error sources).

create index if not exists idx_request_traces_started_at
    on request_traces (started_at desc);

create index if not exists idx_request_traces_org_started_at
    on request_traces (organization_id, started_at desc);

create index if not exists idx_document_attempts_errors
    on organization_document_attempts (organization_id, created_at desc)
    where error_code is not null;

create index if not exists idx_execution_plan_steps_errors
    on organization_execution_plan_steps (organization_id, (coalesce(finished_at, updated_at)) desc)
    where error_code is not null;

create index if not exists idx_nfe_distribution_polls_errors
    on organization_company_nfe_distribution_polls (organization_id, created_at desc)
    where outcome = 'error';

-- +migrate Down

drop index if exists idx_nfe_distribution_polls_errors;
drop index if exists idx_execution_plan_steps_errors;
drop index if exists idx_document_attempts_errors;
drop index if exists idx_request_traces_org_started_at;
drop index if exists idx_request_traces_started_at;
