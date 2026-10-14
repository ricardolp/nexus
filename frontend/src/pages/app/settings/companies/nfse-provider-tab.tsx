import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, LandmarkIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiCompany, ApiCompanyNFSeProviderSettings, ApiNFSeProviderDescriptor } from '@/lib/api-types';
import {
  deleteCompanyNFSeProviderSettings,
  listCompanyNFSeProviderSettings,
  listNFSeMunicipalProviders,
  upsertCompanyNFSeProviderSettings
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Skeleton } from '@/components/ui/skeleton';

const routeSourceLabels: Record<string, string> = {
  municipal_catalog: 'Definido pelo município',
  company_force_route: 'Forçado para esta empresa',
  default: 'Padrão (Sistema Nacional)'
};

const providerHelp: Record<string, string> = {
  ipm:
    'Usuário e senha do portal da prefeitura (Atende.Net). Antes de emitir, libere o acesso em ' +
    'Autorização → Utilização de NFSe → "Emissão de NFS-e por WebService" → Liberar Acesso ao Usuário.'
};

function configValue(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value);
}

function CredentialsCard({
  company,
  provider,
  settings
}: {
  company: ApiCompany;
  provider: ApiNFSeProviderDescriptor;
  settings: ApiCompanyNFSeProviderSettings | undefined;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(settings?.username ?? company.cnpj);
  const [password, setPassword] = useState('');

  useEffect(() => {
    setUsername(settings?.username ?? company.cnpj);
  }, [settings?.username, company.cnpj]);

  const queryKey = ['nfse-provider-settings', organizationId, company.id];

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertCompanyNFSeProviderSettings(token!, organizationId!, company.id, provider.code, {
        username: username.trim(),
        ...(password ? { password } : {})
      }),
    onSuccess: () => {
      toast.success('Credenciais salvas', { description: provider.name });
      setPassword('');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar as credenciais.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompanyNFSeProviderSettings(token!, organizationId!, company.id, provider.code),
    onSuccess: () => {
      toast.success('Credenciais removidas', { description: provider.name });
      setPassword('');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover as credenciais.');
    }
  });

  const configured = Boolean(settings?.username && settings?.has_password);
  const needsPassword = !settings?.has_password;
  const canSave = username.trim() !== '' && (!needsPassword || password !== '') && !saveMutation.isPending;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Credenciais do webservice da prefeitura
        </CardTitle>
        <CardDescription>{providerHelp[provider.code] ?? 'Usuário e senha do webservice municipal.'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Situação:</span>
          {configured ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Configurado
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
              Pendente — as notas deste município não serão transmitidas
            </Badge>
          )}
        </div>
        <form
          className="grid gap-4 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) saveMutation.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="nfse-provider-username">Usuário (CPF/CNPJ)</Label>
            <Input
              id="nfse-provider-username"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nfse-provider-password">Senha</Label>
            <PasswordInput
              id="nfse-provider-password"
              autoComplete="new-password"
              placeholder={settings?.has_password ? '•••••••• (deixe em branco para manter)' : 'Senha do portal da prefeitura'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              A senha é guardada criptografada e nunca é exibida de volta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSave}>
              <SaveIcon />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar credenciais'}
            </Button>
            {settings && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                <Trash2Icon />
                {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CompanyNFSeProviderTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const enabled = Boolean(token && organizationId);

  const settingsQuery = useQuery({
    queryKey: ['nfse-provider-settings', organizationId, company.id],
    queryFn: () => listCompanyNFSeProviderSettings(token!, organizationId!, company.id),
    enabled
  });

  const catalogQuery = useQuery({
    queryKey: ['nfse-municipal-providers'],
    queryFn: () => listNFSeMunicipalProviders(token!),
    enabled,
    staleTime: 5 * 60 * 1000
  });

  const route = settingsQuery.data?.route;
  const providerCode = route?.provider_code ?? 'sefin_nacional';
  const provider = useMemo(
    () => catalogQuery.data?.providers.find((item) => item.code === providerCode),
    [catalogQuery.data, providerCode]
  );
  const municipality = useMemo(
    () =>
      catalogQuery.data?.items.find(
        (item) => item.ibge_municipality_code === (route?.municipality_code || company.ibge_municipality_code)
      ),
    [catalogQuery.data, route?.municipality_code, company.ibge_municipality_code]
  );
  const settings = settingsQuery.data?.items.find((item) => item.provider_code === providerCode);

  if (settingsQuery.isLoading || catalogQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {settingsQuery.error instanceof ApiError
          ? settingsQuery.error.message
          : 'Não foi possível carregar a configuração de NFS-e municipal.'}
      </p>
    );
  }

  const baseUrl = configValue(route?.provider_config, 'base_url');
  const serie = configValue(route?.provider_config, 'serie_nfse');
  const assinatura = configValue(route?.provider_config, 'assinatura');

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <LandmarkIcon className="size-4" />
            Provedor de NFS-e
          </CardTitle>
          <CardDescription>
            Para onde as NFS-e de saída desta empresa são transmitidas, conforme o município do prestador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <span>Município</span>
            <span className="text-foreground">
              {municipality
                ? `${municipality.municipality_name}/${municipality.uf}`
                : company.ibge_municipality_code || '—'}
              {company.ibge_municipality_code ? ` (IBGE ${company.ibge_municipality_code})` : ''}
            </span>
            <span>Provedor</span>
            <span className="text-foreground flex items-center gap-2">
              {provider?.name ?? providerCode}
              {route && (
                <Badge variant="outline" className="font-normal">
                  {routeSourceLabels[route.source] ?? route.source}
                </Badge>
              )}
            </span>
            {baseUrl && (
              <>
                <span>Webservice</span>
                <span className="text-foreground break-all">{baseUrl}</span>
              </>
            )}
            {serie && (
              <>
                <span>Série da NFS-e</span>
                <span className="text-foreground">{serie}</span>
              </>
            )}
            {assinatura && (
              <>
                <span>Assina o XML</span>
                <span className="text-foreground">{assinatura}</span>
              </>
            )}
          </div>
          {!company.ibge_municipality_code && (
            <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
              Empresa sem código IBGE do município — preencha na aba Geral para o roteamento funcionar.
            </p>
          )}
          {provider?.credentials === 'none' && (
            <p className="text-muted-foreground mt-4 text-sm">
              Este provedor usa o certificado A1 da empresa; não há credenciais adicionais para cadastrar.
            </p>
          )}
        </CardContent>
      </Card>

      {provider && provider.credentials !== 'none' && (
        <CredentialsCard company={company} provider={provider} settings={settings} />
      )}
    </div>
  );
}
