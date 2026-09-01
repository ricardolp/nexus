-- Records which scenario a document resolved to, independent of whether
-- matching/validation ever ran. Previously the only record of "which
-- scenario applied" was organization_document_validations.organization_inbound_scenario_id
-- (internal/inbound/execution_engine.go's getDocumentScenarioID) — a
-- validation row that only ever gets inserted once matching reaches the
-- validation phase. A document that fails earlier (e.g. SAP unreachable
-- during vendor resolution) resolves a scenario but never has anywhere to
-- persist it, so GetOrchestrationView silently returns scenario=null even
-- though the resolution succeeded — the UI can't show what process
-- template/steps *would* run, only that something is stuck.
create table organization_document_scenario_resolutions (
    organization_document_id uuid primary key references organization_documents(id) on delete cascade,
    organization_id uuid not null references organizations(id),
    organization_inbound_scenario_id uuid not null references organization_inbound_scenarios(id),
    resolved_at timestamptz not null default now()
);
