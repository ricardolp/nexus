export const COMPANIES_PATH = '/app/settings/companies';

export type CompanyTab =
  | 'general'
  | 'certificate'
  | 'nfse-activities'
  | 'nfse-provider'
  | 'process-flows'
  | 'emails'
  | 'danger';

export function companyPath(companyId: string, tab?: CompanyTab) {
  const base = `${COMPANIES_PATH}/${companyId}`;
  return tab && tab !== 'general' ? `${base}?tab=${tab}` : base;
}

export function companyProcessFlowPath(companyId: string, scenarioId: string, search?: string) {
  const qs = search?.replace(/^\?/, '');
  return `${COMPANIES_PATH}/${companyId}/process-flows/${scenarioId}${qs ? `?${qs}` : ''}`;
}
