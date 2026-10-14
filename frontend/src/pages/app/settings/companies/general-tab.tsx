import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { CatalogSearchField } from '@/components/catalog/catalog-search-field';
import { ApiError } from '@/lib/api';
import { searchCatalogMunicipalities, updateCompanyDetails } from '@/lib/endpoints';
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
import { CompanyDanfseLogoCard } from './danfse-logo-card';

type Section = 'general' | 'tax' | 'environment';

const OP_SIMP_NAC_LABELS: Record<string, string> = {
  '1': '1 — Não Optante',
  '2': '2 — Optante MEI',
  '3': '3 — Optante ME/EPP'
};

const REG_ESP_TRIB_LABELS: Record<string, string> = {
  '0': '0 — Nenhum',
  '1': '1 — Ato Cooperado (Cooperativa)',
  '2': '2 — Estimativa',
  '3': '3 — Microempresa Municipal',
  '4': '4 — Notário ou Registrador',
  '5': '5 — Profissional Autônomo',
  '6': '6 — Sociedade de Profissionais',
  '7': '7 — Específicos Municipais'
};

export function CompanyGeneralTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Section | null>(null);
  const [legalName, setLegalName] = useState(company.legal_name);
  const [tradeName, setTradeName] = useState(company.trade_name ?? '');
  const [uf, setUf] = useState(company.uf ?? '');
  const [municipalRegistration, setMunicipalRegistration] = useState(company.municipal_registration ?? '');
  const [ibgeMunicipalityCode, setIbgeMunicipalityCode] = useState(company.ibge_municipality_code ?? '');
  const [ibgeMunicipalityLabel, setIbgeMunicipalityLabel] = useState(company.ibge_municipality_code ?? '');
  const [taxRegime, setTaxRegime] = useState(company.tax_regime ?? '1');
  const [specialTaxRegime, setSpecialTaxRegime] = useState(company.special_tax_regime ?? '0');
  const [environment, setEnvironment] = useState<'production' | 'homologation'>(
    company.environment === 'production' ? 'production' : 'homologation'
  );

  function syncFromCompany() {
    setLegalName(company.legal_name);
    setTradeName(company.trade_name ?? '');
    setUf(company.uf ?? '');
    setMunicipalRegistration(company.municipal_registration ?? '');
    setIbgeMunicipalityCode(company.ibge_municipality_code ?? '');
    setIbgeMunicipalityLabel(company.ibge_municipality_code ?? '');
    setTaxRegime(company.tax_regime ?? '1');
    setSpecialTaxRegime(company.special_tax_regime ?? '0');
    setEnvironment(company.environment === 'production' ? 'production' : 'homologation');
  }

  useEffect(() => {
    if (editing) return;
    syncFromCompany();
  }, [company, editing]);

  function startEdit(section: Section) {
    syncFromCompany();
    setEditing(section);
  }

  const saveMutation = useMutation({
    mutationFn: (next: {
      legal_name: string;
      trade_name: string;
      uf: string;
      environment: 'production' | 'homologation';
      municipal_registration: string;
      ibge_municipality_code: string;
      tax_regime: string;
      special_tax_regime: string;
    }) =>
      updateCompanyDetails(token!, organizationId!, company.id, {
        legal_name: next.legal_name,
        trade_name: next.trade_name,
        uf: next.uf,
        environment: next.environment,
        municipal_registration: next.municipal_registration,
        ibge_municipality_code: next.ibge_municipality_code,
        tax_regime: next.tax_regime,
        special_tax_regime: next.special_tax_regime
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
      municipal_registration:
        section === 'tax' ? municipalRegistration : (company.municipal_registration ?? ''),
      ibge_municipality_code:
        section === 'tax' ? ibgeMunicipalityCode : (company.ibge_municipality_code ?? ''),
      tax_regime: section === 'tax' ? taxRegime : (company.tax_regime ?? '1'),
      special_tax_regime: section === 'tax' ? specialTaxRegime : (company.special_tax_regime ?? '0'),
      environment:
        section === 'environment'
          ? environment
          : company.environment === 'production'
            ? 'production'
            : 'homologation'
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
          <Button
            type="button"
            size="sm"
            onClick={() => save(section)}
            disabled={saving || (section === 'tax' && uf.length !== 2)}
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
          <CardDescription>
            CNPJ, UF, inscrição municipal, município IBGE e regime tributário da NFS-e Nacional (opSimpNac /
            regEspTrib).
          </CardDescription>
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
              <div className="grid gap-2">
                <Label htmlFor="im">Inscrição municipal</Label>
                <Input
                  id="im"
                  value={municipalRegistration}
                  onChange={(e) => setMunicipalRegistration(e.target.value)}
                />
              </div>
              <CatalogSearchField
                label="Município (IBGE)"
                value={ibgeMunicipalityCode}
                displayValue={ibgeMunicipalityLabel || ibgeMunicipalityCode}
                placeholder="Busque por nome ou código IBGE"
                enabled={!!token && !!organizationId}
                queryKey={['catalog-muni-company', organizationId, uf]}
                queryFn={async (q) => {
                  const res = await searchCatalogMunicipalities(token!, organizationId!, {
                    q,
                    uf: uf || undefined,
                    limit: 40
                  });
                  return res.items.map((m) => ({
                    value: m.code,
                    label: `${m.name} / ${m.uf}`,
                    hint: m.code
                  }));
                }}
                onSelect={(opt) => {
                  setIbgeMunicipalityCode(opt.value);
                  setIbgeMunicipalityLabel(`${opt.value} — ${opt.label}`);
                }}
                onClear={() => {
                  setIbgeMunicipalityCode('');
                  setIbgeMunicipalityLabel('');
                }}
              />
              <div className="grid gap-2">
                <Label>Situação perante o Simples Nacional</Label>
                <Select value={taxRegime} onValueChange={setTaxRegime}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OP_SIMP_NAC_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Regime especial de tributação</Label>
                <Select value={specialTaxRegime} onValueChange={setSpecialTaxRegime}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REG_ESP_TRIB_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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
              <FieldRow label="Inscrição municipal" value={company.municipal_registration} />
              <FieldRow label="Município IBGE" value={company.ibge_municipality_code} />
              <FieldRow
                label="Simples Nacional"
                value={
                  company.tax_regime
                    ? (OP_SIMP_NAC_LABELS[company.tax_regime] ?? company.tax_regime)
                    : null
                }
              />
              <FieldRow
                label="Regime especial"
                value={
                  company.special_tax_regime
                    ? (REG_ESP_TRIB_LABELS[company.special_tax_regime] ?? company.special_tax_regime)
                    : null
                }
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Ambiente</CardTitle>
          <CardDescription>Produção ou homologação para emissão e consulta na SEFAZ / SEFIN.</CardDescription>
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

      <CompanyDanfseLogoCard company={company} />
    </div>
  );
}
