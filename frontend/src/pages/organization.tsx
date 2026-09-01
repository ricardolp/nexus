import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2Icon, CheckIcon, FileBarChartIcon, PencilIcon, ShieldCheckIcon, XIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  getOrganization,
  listMemberRoles,
  listMembers,
  listRoles,
  updateOrganization
} from '@/lib/endpoints';
import type { ApiOrganization } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { OrganizationMark } from '@/components/layout/org-header';
import { SectionNav } from '@/components/layout/section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { timezones } from '@/pages/profile/helpers';
import { FieldRow } from './organization/field-row';
import {
  formatTaxId,
  localeLabel,
  locales,
  statusLabels
} from './organization/helpers';
import { OrganizationSecurityTab } from './organization/security-tab';
import { OrganizationConsumoTab } from './organization/consumo-tab';

type Section = 'general' | 'tax' | 'defaults';
type OrgTab = 'general' | 'consumo' | 'security';

const orgTabs: { id: OrgTab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'Geral', icon: <Building2Icon className="size-4" /> },
  { id: 'consumo', label: 'Consumo', icon: <FileBarChartIcon className="size-4" /> },
  { id: 'security', label: 'Segurança', icon: <ShieldCheckIcon className="size-4" /> }
];

export default function OrganizationPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const cachedOrg = useAuthStore((s) => s.organization);
  const setOrganization = useAuthStore((s) => s.setOrganization);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: OrgTab =
    searchParams.get('tab') === 'security' || searchParams.get('tab') === 'consumo'
      ? (searchParams.get('tab') as OrgTab)
      : 'general';

  const [editing, setEditing] = useState<Section | null>(null);
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [taxIdentifier, setTaxIdentifier] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [locale, setLocale] = useState('pt-BR');

  const enabled = Boolean(token && organizationId);

  const orgQuery = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => getOrganization(token!, organizationId!),
    enabled
  });

  const membersQuery = useQuery({
    queryKey: ['members', organizationId],
    queryFn: () => listMembers(token!, organizationId!),
    enabled
  });

  const rolesQuery = useQuery({
    queryKey: ['roles', organizationId],
    queryFn: () => listRoles(token!, organizationId!),
    enabled
  });

  const org = orgQuery.data ?? cachedOrg;
  const currentMember = membersQuery.data?.items.find((member) => member.user_id === user?.id);

  const memberRolesQuery = useQuery({
    queryKey: ['member-roles', organizationId, currentMember?.id],
    queryFn: () => listMemberRoles(token!, organizationId!, currentMember!.id),
    enabled: enabled && Boolean(currentMember?.id)
  });

  const canEdit = useMemo(() => {
    const roleIds = new Set(memberRolesQuery.data?.items.map((item) => item.organization_role_id) ?? []);
    return (rolesQuery.data?.items ?? []).some(
      (role) => roleIds.has(role.id) && role.permissions.includes('organization:update')
    );
  }, [memberRolesQuery.data, rolesQuery.data]);

  useEffect(() => {
    if (!orgQuery.data) return;
    setOrganization(orgQuery.data);
  }, [orgQuery.data, setOrganization]);

  useEffect(() => {
    if (!org || editing) return;
    setLegalName(org.legal_name);
    setTradeName(org.trade_name ?? '');
    setTaxIdentifier(org.tax_identifier ?? '');
    setTimezone(org.timezone || 'America/Sao_Paulo');
    setLocale(org.default_locale || 'pt-BR');
  }, [org, editing]);

  function setTab(next: OrgTab) {
    setEditing(null);
    setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true });
  }

  function startEdit(section: Section) {
    if (!canEdit || !org) return;
    setLegalName(org.legal_name);
    setTradeName(org.trade_name ?? '');
    setTaxIdentifier(org.tax_identifier ?? '');
    setTimezone(org.timezone || 'America/Sao_Paulo');
    setLocale(org.default_locale || 'pt-BR');
    setEditing(section);
  }

  const saveOrg = useMutation({
    mutationFn: (next: Partial<Pick<ApiOrganization, 'legal_name' | 'trade_name' | 'tax_identifier' | 'timezone' | 'default_locale'>>) =>
      updateOrganization(token!, organizationId!, {
        legal_name: next.legal_name ?? org!.legal_name,
        trade_name: next.trade_name ?? org?.trade_name ?? '',
        tax_identifier: next.tax_identifier ?? org?.tax_identifier ?? '',
        timezone: next.timezone ?? org?.timezone,
        default_locale: next.default_locale ?? org?.default_locale
      }),
    onSuccess: (updated) => {
      setOrganization(updated);
      void queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      toast.success('Organização atualizada');
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  const saving = saveOrg.isPending;

  function sectionActions(section: Section) {
    if (!canEdit) return null;
    if (editing === section) {
      return (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(null)}
            disabled={saving}
          >
            <XIcon />
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (section === 'general') {
                saveOrg.mutate({ legal_name: legalName, trade_name: tradeName });
              } else if (section === 'tax') {
                saveOrg.mutate({ tax_identifier: taxIdentifier });
              } else {
                saveOrg.mutate({ timezone, default_locale: locale });
              }
            }}
            disabled={saving}
          >
            <CheckIcon />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      );
    }
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => startEdit(section)} disabled={editing !== null}>
        <PencilIcon />
        Editar
      </Button>
    );
  }

  if (!organizationId) {
    return <p className="text-muted-foreground text-sm">Nenhuma organização associada à sua conta no momento.</p>;
  }

  if (orgQuery.isLoading && !org) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (orgQuery.isError && !org) {
    return (
      <p className="text-destructive text-sm">
        {orgQuery.error instanceof ApiError ? orgQuery.error.message : 'Não foi possível carregar a organização.'}
      </p>
    );
  }

  if (!org) return null;

  const displayName = org.trade_name || org.legal_name;
  const timezoneLabel = timezones.find((item) => item.value === org.timezone)?.label ?? org.timezone;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <OrganizationMark organization={org} displayName={displayName} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">Organização</h2>
            <Badge variant="secondary">{canEdit ? 'Administrador' : 'Membro'}</Badge>
            <Badge variant="outline">{statusLabels[org.status] ?? org.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Identidade, consumo e políticas de segurança de {displayName}.
            {!canEdit && ' Somente administradores podem editar estes dados.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <SectionNav items={orgTabs} value={tab} onChange={setTab} />
        <div className="min-w-0 flex-1">
          {tab === 'security' ? (
            <OrganizationSecurityTab canEdit={canEdit} />
          ) : tab === 'consumo' ? (
            <OrganizationConsumoTab />
          ) : (
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Geral</CardTitle>
                  <CardDescription>Nome, identificador público e status da organização.</CardDescription>
                  <CardAction>{sectionActions('general')}</CardAction>
                </CardHeader>
                <CardContent>
                  {editing === 'general' ? (
                    <div className="grid gap-4 py-2">
                      <div className="grid gap-2">
                        <Label htmlFor="legal-name">Razão social</Label>
                        <Input id="legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="trade-name">Nome fantasia</Label>
                        <Input id="trade-name" value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <FieldRow label="Razão social" value={org.legal_name} />
                      <FieldRow label="Nome fantasia" value={org.trade_name} />
                      <FieldRow label="Identificador" value={org.slug} />
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Identificação fiscal</CardTitle>
                  <CardDescription>Documento usado na identificação da organização.</CardDescription>
                  <CardAction>{sectionActions('tax')}</CardAction>
                </CardHeader>
                <CardContent>
                  {editing === 'tax' ? (
                    <div className="grid gap-2 py-2">
                      <Label htmlFor="tax-id">CNPJ</Label>
                      <Input id="tax-id" value={taxIdentifier} onChange={(e) => setTaxIdentifier(e.target.value)} />
                    </div>
                  ) : (
                    <FieldRow label="CNPJ" value={formatTaxId(org.tax_identifier)} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Padrões</CardTitle>
                  <CardDescription>Fuso horário e idioma usados pela organização.</CardDescription>
                  <CardAction>{sectionActions('defaults')}</CardAction>
                </CardHeader>
                <CardContent>
                  {editing === 'defaults' ? (
                    <div className="grid gap-4 py-2">
                      <div className="grid gap-2">
                        <Label>Fuso horário</Label>
                        <Select value={timezone} onValueChange={setTimezone}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {timezones.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Idioma</Label>
                        <Select value={locale} onValueChange={setLocale}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {locales.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FieldRow label="Fuso horário" value={timezoneLabel} />
                      <FieldRow label="Idioma" value={localeLabel(org.default_locale)} />
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
