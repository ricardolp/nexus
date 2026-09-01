import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { updateCompanyDetails } from '@/lib/endpoints';
import type { ApiCompany } from '@/lib/api-types';
import { BRAZILIAN_STATES, formatUF } from '@/lib/brazilian-states';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldRow } from '@/pages/organization/field-row';
import { companyEnvironmentLabels, formatCNPJ } from './columns';

type Section = 'general' | 'tax' | 'environment';

export function CompanyGeneralTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Section | null>(null);
  const [legalName, setLegalName] = useState(company.legal_name);
  const [tradeName, setTradeName] = useState(company.trade_name ?? '');
  const [uf, setUf] = useState(company.uf ?? '');
  const [environment, setEnvironment] = useState<'production' | 'homologation'>(
    company.environment === 'production' ? 'production' : 'homologation'
  );

  useEffect(() => {
    if (editing) return;
    setLegalName(company.legal_name);
    setTradeName(company.trade_name ?? '');
    setUf(company.uf ?? '');
    setEnvironment(company.environment === 'production' ? 'production' : 'homologation');
  }, [company, editing]);

  function startEdit(section: Section) {
    setLegalName(company.legal_name);
    setTradeName(company.trade_name ?? '');
    setUf(company.uf ?? '');
    setEnvironment(company.environment === 'production' ? 'production' : 'homologation');
    setEditing(section);
  }

  const saveMutation = useMutation({
    mutationFn: (next: { legal_name: string; trade_name: string; uf: string; environment: 'production' | 'homologation' }) =>
      updateCompanyDetails(token!, organizationId!, company.id, {
        legal_name: next.legal_name,
        trade_name: next.trade_name,
        uf: next.uf,
        environment: next.environment
      }),
    onSuccess: () => {
      toast.success('Empresa atualizada');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['companies', organizationId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  const saving = saveMutation.isPending;

  function save(section: Section) {
    saveMutation.mutate({
      legal_name: section === 'general' ? legalName : company.legal_name,
      trade_name: section === 'general' ? tradeName : (company.trade_name ?? ''),
      uf: section === 'tax' ? uf : (company.uf ?? ''),
      environment: section === 'environment' ? environment : company.environment === 'production' ? 'production' : 'homologation'
    });
  }

  function sectionActions(section: Section) {
    if (editing === section) {
      return (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>
            <XIcon />
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => save(section)} disabled={saving || (section === 'tax' && uf.length !== 2)}>
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Geral</CardTitle>
          <CardDescription>Razão social e nome fantasia desta empresa.</CardDescription>
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
              <FieldRow label="Razão social" value={company.legal_name} />
              <FieldRow label="Nome fantasia" value={company.trade_name} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Identificação fiscal</CardTitle>
          <CardDescription>CNPJ e UF de registro. O CNPJ não pode ser alterado depois do cadastro.</CardDescription>
          <CardAction>{sectionActions('tax')}</CardAction>
        </CardHeader>
        <CardContent>
          {editing === 'tax' ? (
            <div className="grid gap-4 py-2">
              <FieldRow label="CNPJ" value={formatCNPJ(company.cnpj)} />
              <div className="grid gap-2">
                <Label>UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZILIAN_STATES.map((state) => (
                      <SelectItem key={state.uf} value={state.uf}>
                        {state.uf} — {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <FieldRow label="CNPJ" value={formatCNPJ(company.cnpj)} />
              <FieldRow label="UF" value={company.uf ? formatUF(company.uf) : null} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Ambiente</CardTitle>
          <CardDescription>Produção ou homologação para emissão e consulta na SEFAZ.</CardDescription>
          <CardAction>{sectionActions('environment')}</CardAction>
        </CardHeader>
        <CardContent>
          {editing === 'environment' ? (
            <div className="grid gap-2 py-2">
              <Label>Ambiente</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as 'production' | 'homologation')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologation">Homologação</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <FieldRow
              label="Ambiente"
              value={companyEnvironmentLabels[company.environment] ?? company.environment}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
