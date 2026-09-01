import { useMemo, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2Icon,
  ChevronLeftIcon,
  FileBadgeIcon,
  PlugZapIcon,
  ShieldAlertIcon,
  WorkflowIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { listCompanies } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { SectionNav } from '@/components/layout/section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyCertificateTab } from './certificate-tab';
import { companyStatusLabels, formatCNPJ } from './columns';
import { CompanyDangerZone } from './danger-zone';
import { CompanyGeneralTab } from './general-tab';
import { COMPANIES_PATH, type CompanyTab } from './paths';
import { CompanyProcessFlowsTab } from './process-flows-tab';
import { CompanyServicesTab } from './services-tab';

const companyTabs: { id: CompanyTab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'Geral', icon: <Building2Icon className="size-4" /> },
  { id: 'certificate', label: 'Certificado', icon: <FileBadgeIcon className="size-4" /> },
  { id: 'services', label: 'Serviços', icon: <PlugZapIcon className="size-4" /> },
  { id: 'process-flows', label: 'Fluxos de processo', icon: <WorkflowIcon className="size-4" /> },
  { id: 'danger', label: 'Zona de perigo', icon: <ShieldAlertIcon className="size-4" /> }
];

function parseTab(value: string | null): CompanyTab {
  if (value === 'certificate' || value === 'services' || value === 'process-flows' || value === 'danger') {
    return value;
  }
  return 'general';
}

export default function CompanyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const tab = parseTab(searchParams.get('tab'));

  const enabled = Boolean(token && organizationId);

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled
  });

  const company = useMemo(
    () => companiesQuery.data?.items.find((item) => item.id === companyId),
    [companiesQuery.data, companyId]
  );

  function setTab(next: CompanyTab) {
    setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true });
  }

  if (!organizationId) {
    return <p className="text-muted-foreground text-sm">Nenhuma organização associada à sua conta no momento.</p>;
  }

  if (companiesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (companiesQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {companiesQuery.error instanceof ApiError
          ? companiesQuery.error.message
          : 'Não foi possível carregar a empresa.'}
      </p>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-medium">Empresa não encontrada</p>
        <p className="text-muted-foreground text-sm">
          Esta empresa não existe nesta organização ou foi removida.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link to={COMPANIES_PATH}>Voltar para empresas</Link>
        </Button>
      </div>
    );
  }

  const displayName = company.trade_name || company.legal_name;
  const status = companyStatusLabels[company.status] ?? { label: company.status, className: '' };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 w-fit" asChild>
          <Link to={COMPANIES_PATH}>
            <ChevronLeftIcon className="size-4" />
            Empresas
          </Link>
        </Button>
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center rounded-xl">
            <Building2Icon className="size-7" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{displayName}</h2>
              <Badge variant="outline" className={status.className}>
                {status.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {company.legal_name !== displayName ? `${company.legal_name} · ` : null}
              {formatCNPJ(company.cnpj)}
              {company.uf ? ` · ${company.uf}` : null}
            </p>
          </div>
        </div>
      </div>

      {company.status === 'disabled' && (
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm">
          Esta empresa está desativada. Reative-a na Zona de perigo para voltar a emitir e consultar documentos.
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <SectionNav items={companyTabs} value={tab} onChange={setTab} />
        <div className="min-w-0 flex-1">
          {tab === 'certificate' ? (
            <CompanyCertificateTab company={company} />
          ) : tab === 'services' ? (
            <CompanyServicesTab company={company} />
          ) : tab === 'process-flows' ? (
            <CompanyProcessFlowsTab company={company} />
          ) : tab === 'danger' ? (
            <CompanyDangerZone company={company} />
          ) : (
            <CompanyGeneralTab company={company} />
          )}
        </div>
      </div>
    </div>
  );
}
