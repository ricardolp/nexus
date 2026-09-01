import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from 'recharts';
import {
  AlertTriangleIcon,
  Building2Icon,
  FileTextIcon,
  LayersIcon,
  RadioTowerIcon,
  UsersIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { listOrganizationsUsage } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

const membersChartConfig = {
  members_count: { label: 'Membros', color: 'var(--chart-1)' }
} satisfies ChartConfig;

const statusChartConfig = {
  count: { label: 'Organizações' },
  active: { label: 'Ativa', color: 'var(--chart-1)' },
  suspended: { label: 'Suspensa', color: 'var(--chart-4)' },
  other: { label: 'Outro', color: 'var(--chart-3)' }
} satisfies ChartConfig;

const statusLabels: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  inactive: 'Inativa'
};

export default function AdminOverviewPage() {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['organizations-usage'],
    queryFn: () => listOrganizationsUsage(token!),
    enabled: !!token
  });

  const items = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : data.items;
  }, [data]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, org) => ({
          organizations: acc.organizations + 1,
          members: acc.members + org.members_count,
          companies: acc.companies + org.companies_count,
          documents: acc.documents + org.documents_count,
          documents24h: acc.documents24h + (org.documents_last_24h ?? 0),
          errors24h: acc.errors24h + (org.errors_last_24h ?? 0),
          distributionErrors: acc.distributionErrors + (org.distribution_error_companies ?? 0)
        }),
        {
          organizations: 0,
          members: 0,
          companies: 0,
          documents: 0,
          documents24h: 0,
          errors24h: 0,
          distributionErrors: 0
        }
      ),
    [items]
  );

  const membersChartData = useMemo(
    () =>
      [...items]
        .sort((a, b) => b.members_count - a.members_count)
        .slice(0, 8)
        .map((org) => ({ name: org.slug, members_count: org.members_count })),
    [items]
  );

  const statusChartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const org of items) {
      counts.set(org.status, (counts.get(org.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([status, count]) => ({
      status: statusLabels[status] ?? status,
      count,
      fill:
        status === 'active'
          ? 'var(--color-active)'
          : status === 'suspended'
            ? 'var(--color-suspended)'
            : 'var(--color-other)'
    }));
  }, [items]);

  const statCards = [
    { label: 'Organizações', value: totals.organizations, icon: LayersIcon },
    { label: 'Membros ativos', value: totals.members, icon: UsersIcon },
    { label: 'Empresas (CNPJs)', value: totals.companies, icon: Building2Icon },
    { label: 'Documentos fiscais', value: totals.documents, icon: FileTextIcon },
    { label: 'Documentos (24h)', value: totals.documents24h, icon: FileTextIcon },
    { label: 'Erros (24h)', value: totals.errors24h, icon: AlertTriangleIcon },
    { label: 'Distribuição em erro', value: totals.distributionErrors, icon: RadioTowerIcon }
  ];

  if (isError) {
    return (
      <p className="text-destructive text-sm">
        {error instanceof ApiError ? error.message : 'Não foi possível carregar os dados administrativos.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <card.icon className="size-3.5" />
                {card.label}
              </CardDescription>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {card.value.toLocaleString('pt-BR')}
                </CardTitle>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Membros por organização</CardTitle>
            <CardDescription>Top organizações por número de membros ativos</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer config={membersChartConfig} className="aspect-auto h-[300px] w-full">
                <BarChart data={membersChartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="members_count" fill="var(--color-members_count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Organizações por status</CardTitle>
            <CardDescription>Distribuição do status dos tenants</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="mx-auto h-[300px] w-[300px] rounded-full" />
            ) : (
              <ChartContainer config={statusChartConfig} className="mx-auto aspect-square h-[300px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
                  <Pie data={statusChartData} dataKey="count" nameKey="status" innerRadius={60} strokeWidth={4} />
                  <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organizações</CardTitle>
          <CardDescription>
            {items.length} organização(ões) — clique para ver métricas por empresa
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Empresas</TableHead>
                  <TableHead className="text-right">Membros</TableHead>
                  <TableHead className="text-right">Documentos</TableHead>
                  <TableHead className="text-right">Docs 24h</TableHead>
                  <TableHead className="text-right">Erros 24h</TableHead>
                  <TableHead className="text-right">Dist. erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((org) => (
                  <TableRow key={org.organization_id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <Link
                        to={`/admin/organizations/${org.organization_id}`}
                        className="text-primary hover:underline"
                      >
                        {org.legal_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{statusLabels[org.status] ?? org.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{org.companies_count}</TableCell>
                    <TableCell className="text-right">{org.members_count}</TableCell>
                    <TableCell className="text-right">{org.documents_count}</TableCell>
                    <TableCell className="text-right">{org.documents_last_24h ?? 0}</TableCell>
                    <TableCell className="text-right">{org.errors_last_24h ?? 0}</TableCell>
                    <TableCell className="text-right">{org.distribution_error_companies ?? 0}</TableCell>
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
