import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  FileBarChartIcon,
  LogInIcon,
  PlusIcon,
  PlugZapIcon,
  RadioTowerIcon,
  Trash2Icon
} from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiOrganizationService } from '@/lib/api-types';
import {
  addSupportMember,
  getOrganization,
  listCompaniesUsage,
  listMyOrganizations,
  listOrganizationServices,
  listPlatformUsers,
  listSupportMembers,
  removeSupportMember,
  updateOrganizationServiceStatus
} from '@/lib/endpoints';
import { formatCNPJ } from '@/pages/app/settings/companies/columns';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  system: 'Sistema',
  support: 'Suporte'
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminOrganizationPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>();
  const token = useAuthStore((s) => s.token);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [entering, setEntering] = useState(false);

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

  const supportQuery = useQuery({
    queryKey: ['admin-support-members', organizationId],
    queryFn: () => listSupportMembers(token!, organizationId),
    enabled: !!token && !!organizationId
  });

  const myOrgsQuery = useQuery({
    queryKey: ['my-organizations'],
    queryFn: () => listMyOrganizations(token!),
    enabled: !!token
  });

  const staffQuery = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => listPlatformUsers(token!),
    enabled: !!token
  });

  const servicesQueryKey = ['organization-services', organizationId] as const;
  const servicesQuery = useQuery({
    queryKey: servicesQueryKey,
    queryFn: () => listOrganizationServices(token!, organizationId),
    enabled: !!token && !!organizationId
  });

  const serviceStatusMutation = useMutation({
    mutationFn: ({
      service,
      status
    }: {
      service: ApiOrganizationService;
      status: 'active' | 'disabled';
    }) => updateOrganizationServiceStatus(token!, organizationId, service.service_id, status),
    onMutate: async ({ service, status }) => {
      await queryClient.cancelQueries({ queryKey: servicesQueryKey });
      const previous = queryClient.getQueryData<{ items: ApiOrganizationService[] }>(servicesQueryKey);
      queryClient.setQueryData<{ items: ApiOrganizationService[] }>(servicesQueryKey, (old) => ({
        items: (old?.items ?? []).map((s) => (s.service_id === service.service_id ? { ...s, status } : s))
      }));
      return { previous };
    },
    onSuccess: (service) => {
      toast.success(service.status === 'active' ? 'Serviço ativado' : 'Serviço desativado', {
        description: service.service_name
      });
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(servicesQueryKey, context.previous);
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o serviço.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: servicesQueryKey });
    }
  });

  const addMutation = useMutation({
    mutationFn: (userId: string) => addSupportMember(token!, organizationId, { user_id: userId }),
    onSuccess: (member) => {
      toast.success('Suporte vinculado', { description: member.email });
      setSelectedStaffId('');
      queryClient.invalidateQueries({ queryKey: ['admin-support-members', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível vincular o usuário.');
    }
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeSupportMember(token!, organizationId, memberId),
    onSuccess: () => {
      toast.success('Vínculo removido');
      queryClient.invalidateQueries({ queryKey: ['admin-support-members', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['user-organizations'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover o vínculo.');
    }
  });

  const org = orgQuery.data;
  const companies = usageQuery.data?.items ?? [];
  const supportMembers = supportQuery.data?.items ?? [];
  const linkedUserIds = useMemo(
    () => new Set(supportMembers.map((m) => m.user_id)),
    [supportMembers]
  );
  const availableStaff = useMemo(
    () => (staffQuery.data?.items ?? []).filter((u) => u.status === 'active' && !linkedUserIds.has(u.id)),
    [staffQuery.data?.items, linkedUserIds]
  );
  const canEnter = (myOrgsQuery.data?.items ?? []).some((o) => o.id === organizationId);

  async function handleEnter() {
    if (!organizationId || entering) return;
    setEntering(true);
    try {
      await switchOrganization(organizationId);
      queryClient.clear();
      navigate('/app/overview');
      toast.success('Sessão na organização iniciada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível entrar na organização.');
    } finally {
      setEntering(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/organizations">
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
        <Button size="sm" disabled={!canEnter || entering} onClick={() => void handleEnter()}>
          <LogInIcon />
          {entering ? 'Entrando...' : 'Entrar na organização'}
        </Button>
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
                {!canEnter ? (
                  <span className="text-muted-foreground text-xs">
                    Vincule-se abaixo para entrar no tenant.
                  </span>
                ) : null}
              </CardDescription>
            </>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suporte vinculado</CardTitle>
          <CardDescription>
            Usuários da plataforma com acesso total para setup e suporte nesta organização.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecionar usuário da equipe" />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email} ({roleLabels[user.platform_role] ?? user.platform_role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedStaffId || addMutation.isPending}
              onClick={() => selectedStaffId && addMutation.mutate(selectedStaffId)}
            >
              <PlusIcon />
              Vincular
            </Button>
          </div>

          {supportQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : supportQuery.isError ? (
            <p className="text-destructive text-sm">
              {supportQuery.error instanceof ApiError
                ? supportQuery.error.message
                : 'Não foi possível carregar os vínculos.'}
            </p>
          ) : supportMembers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum usuário de suporte vinculado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {roleLabels[member.platform_role] ?? member.platform_role}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(member.joined_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(member.id)}
                      >
                        <Trash2Icon />
                        <span className="sr-only">Remover</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZapIcon className="size-4" />
            Serviços do contrato
          </CardTitle>
          <CardDescription>
            Módulos fiscais liberados para esta organização. Controlam o menu do tenant e a
            aceitação de documentos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {servicesQuery.isLoading ? (
            <div className="flex flex-col gap-3 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : servicesQuery.isError ? (
            <p className="text-destructive text-sm">
              {servicesQuery.error instanceof ApiError
                ? servicesQuery.error.message
                : 'Não foi possível carregar os serviços.'}
            </p>
          ) : (servicesQuery.data?.items ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum serviço de contrato disponível.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {(servicesQuery.data?.items ?? []).map((service) => {
                const active = service.status === 'active';
                return (
                  <div key={service.service_id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{service.service_name}</p>
                      <p className="text-muted-foreground text-xs">{service.service_code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`org-service-${service.service_id}`}
                        className="text-muted-foreground text-sm font-normal"
                      >
                        {active ? 'Ativo' : 'Inativo'}
                      </Label>
                      <Switch
                        id={`org-service-${service.service_id}`}
                        checked={active}
                        disabled={serviceStatusMutation.isPending}
                        onCheckedChange={(checked) =>
                          serviceStatusMutation.mutate({
                            service,
                            status: checked ? 'active' : 'disabled'
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
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
