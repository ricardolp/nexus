import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, FileBarChartIcon, RadioTowerIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { getOrganization, listCompaniesUsage } from '@/lib/endpoints';
import { formatCNPJ } from '@/pages/app/settings/companies/columns';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

const statusLabels: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  inactive: 'Inativa',
  paused: 'Pausada',
  error: 'Erro'
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminOrganizationPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>();
  const token = useAuthStore((s) => s.token);

  const orgQuery = useQuery({
    queryKey: ['admin-organization', organizationId],
    queryFn: () => getOrganization(token!, organizationId),
    enabled: !!token && !!organizationId
  });

  const usageQuery = useQuery({
    queryKey: ['admin-companies-usage', organizationId],
    queryFn: () => listCompaniesUsage(token!, organizationId),
    enabled: !!token && !!organizationId
  });

  const org = orgQuery.data;
  const companies = usageQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/overview">
            <ArrowLeftIcon />
            Voltar
          </Link>
        </Button>
        {organizationId ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/admin/billing?organizationId=${organizationId}`}>
              <FileBarChartIcon />
              Extrato de consumo
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          {orgQuery.isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : orgQuery.isError ? (
            <CardTitle className="text-destructive text-base">
              {orgQuery.error instanceof ApiError
                ? orgQuery.error.message
                : 'Não foi possível carregar a organização.'}
            </CardTitle>
          ) : (
            <>
              <CardTitle>{org?.legal_name}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span>{org?.slug}</span>
                <Badge variant="outline">{statusLabels[org?.status ?? ''] ?? org?.status}</Badge>
              </CardDescription>
            </>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empresas (CNPJs)</CardTitle>
          <CardDescription>
            Métricas por empresa e atalho para o monitoramento de distribuição NF-e
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : usageQuery.isError ? (
            <p className="text-destructive text-sm">
              {usageQuery.error instanceof ApiError
                ? usageQuery.error.message
                : 'Não foi possível carregar as empresas.'}
            </p>
          ) : companies.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma empresa cadastrada neste tenant.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Documentos</TableHead>
                  <TableHead className="text-right">Docs 24h</TableHead>
                  <TableHead>Último documento</TableHead>
                  <TableHead>Distribuição</TableHead>
                  <TableHead className="text-right">Backlog NSU</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.company_id}>
                    <TableCell className="font-medium">{company.legal_name}</TableCell>
                    <TableCell className="tabular-nums">{formatCNPJ(company.cnpj)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{statusLabels[company.status] ?? company.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{company.documents_count}</TableCell>
                    <TableCell className="text-right">{company.documents_last_24h}</TableCell>
                    <TableCell>{formatDateTime(company.last_document_at)}</TableCell>
                    <TableCell>
                      {company.distribution_status ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline">
                            {statusLabels[company.distribution_status] ?? company.distribution_status}
                          </Badge>
                          {company.distribution_last_message && (
                            <span
                              className="text-muted-foreground max-w-[180px] truncate text-xs"
                              title={company.distribution_last_message}
                            >
                              {company.distribution_last_message}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{company.nsu_backlog ?? '—'}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/admin/nfe-distribution?organizationId=${organizationId}&companyId=${company.company_id}`}
                        >
                          <RadioTowerIcon />
                          NF-e
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
