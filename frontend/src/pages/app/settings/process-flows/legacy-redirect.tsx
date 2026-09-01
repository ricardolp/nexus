import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getInboundScenario } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { COMPANIES_PATH, companyProcessFlowPath } from '../companies/paths';

export default function LegacyProcessFlowRedirect() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const [params] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const companyFromQuery = params.get('company_id');
  const qs = params.toString();

  const needsLookup = Boolean(token && organizationId && scenarioId && scenarioId !== 'new' && !companyFromQuery);

  const scenarioQuery = useQuery({
    queryKey: ['inbound-scenario', organizationId, scenarioId],
    queryFn: () => getInboundScenario(token!, organizationId!, scenarioId!),
    enabled: needsLookup
  });

  if (!scenarioId || scenarioId === 'new') {
    if (companyFromQuery) {
      return <Navigate to={companyProcessFlowPath(companyFromQuery, 'new', qs)} replace />;
    }
    return <Navigate to={COMPANIES_PATH} replace />;
  }

  if (companyFromQuery) {
    return <Navigate to={companyProcessFlowPath(companyFromQuery, scenarioId, qs)} replace />;
  }

  if (scenarioQuery.data) {
    return (
      <Navigate
        to={companyProcessFlowPath(scenarioQuery.data.scenario.organization_company_id, scenarioId, qs)}
        replace
      />
    );
  }

  if (scenarioQuery.isError) {
    return <Navigate to={COMPANIES_PATH} replace />;
  }

  return null;
}
