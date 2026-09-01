import { useEffect, useState, type ComponentType } from 'react';
import {
  Building2Icon,
  FileTextIcon,
  HashIcon,
  IdCardIcon,
  ShoppingCartIcon,
  WarehouseIcon
} from 'lucide-react';

import type { ApiCompany } from '@/lib/api-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatCNPJ } from '@/pages/app/fiscal/format';

export interface ScenarioKeyState {
  organization_company_id: string;
  document_model: string;
  purchase_order_type: string;
  cfop: string;
  vendor_cnpj: string;
  plant: string;
  purchasing_organization: string;
}

const DOCUMENT_MODELS = [
  { value: '55', label: 'NF-e (55)' },
  { value: '65', label: 'NFC-e (65)' },
  { value: '57', label: 'CT-e (57)' }
];

type CriterionField = Exclude<keyof ScenarioKeyState, 'organization_company_id'>;

interface CriterionDef {
  field: CriterionField;
  label: string;
  hint: string;
  placeholder: string;
  icon: ComponentType<{ className?: string }>;
  kind: 'text' | 'model' | 'cnpj';
}

const DOCUMENT_CRITERIA: CriterionDef[] = [
  {
    field: 'document_model',
    label: 'Modelo',
    hint: 'Tipo de documento fiscal',
    placeholder: 'ex.: 55',
    icon: FileTextIcon,
    kind: 'model'
  },
  {
    field: 'cfop',
    label: 'CFOP',
    hint: 'Código fiscal da operação',
    placeholder: 'ex.: 1102',
    icon: HashIcon,
    kind: 'text'
  }
];

const PURCHASE_CRITERIA: CriterionDef[] = [
  {
    field: 'vendor_cnpj',
    label: 'Fornecedor',
    hint: 'CNPJ do emitente da nota',
    placeholder: '00.000.000/0000-00',
    icon: IdCardIcon,
    kind: 'cnpj'
  },
  {
    field: 'purchase_order_type',
    label: 'Tipo de pedido',
    hint: 'Tipo do pedido no SAP',
    placeholder: 'ex.: NB',
    icon: ShoppingCartIcon,
    kind: 'text'
  },
  {
    field: 'plant',
    label: 'Centro',
    hint: 'Centro receptor no SAP',
    placeholder: 'ex.: 1000',
    icon: WarehouseIcon,
    kind: 'text'
  },
  {
    field: 'purchasing_organization',
    label: 'Organização de compras',
    hint: 'Org. de compras no SAP',
    placeholder: 'ex.: 1000',
    icon: Building2Icon,
    kind: 'text'
  }
];

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function displayValue(def: CriterionDef, value: string) {
  if (def.kind === 'cnpj') return formatCNPJ(value);
  if (def.kind === 'model') {
    return DOCUMENT_MODELS.find((m) => m.value === value)?.label ?? value;
  }
  return value;
}

function CriterionRow({
  def,
  value,
  onChange
}: {
  def: CriterionDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const filled = value.trim() !== '';
  const [restrict, setRestrict] = useState(filled);

  useEffect(() => {
    setRestrict(filled);
  }, [filled]);

  const Icon = def.icon;
  const modelOptions =
    def.kind === 'model' && filled && !DOCUMENT_MODELS.some((m) => m.value === value)
      ? [...DOCUMENT_MODELS, { value, label: `Modelo ${value}` }]
      : DOCUMENT_MODELS;

  function setRestricted(next: boolean) {
    setRestrict(next);
    if (!next) onChange('');
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center sm:gap-4',
        restrict ? 'bg-card' : 'bg-muted/30'
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{def.label}</p>
          <p className="text-muted-foreground text-xs">{def.hint}</p>
        </div>
      </div>

      <div className="flex w-full flex-col items-stretch gap-2 sm:w-64 sm:shrink-0">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-muted-foreground text-xs font-normal">
            {restrict ? 'Filtrar por este valor' : 'Qualquer nota'}
          </Label>
          <Switch checked={restrict} onCheckedChange={setRestricted} aria-label={def.label} />
        </div>
        {restrict &&
          (def.kind === 'model' ? (
            <Select value={value || undefined} onValueChange={onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={def.kind === 'cnpj' && value ? formatCNPJ(value) : value}
              placeholder={def.placeholder}
              inputMode={def.kind === 'cnpj' ? 'numeric' : undefined}
              maxLength={def.kind === 'cnpj' ? 18 : def.field === 'cfop' ? 10 : 20}
              onChange={(e) =>
                onChange(def.kind === 'cnpj' ? digitsOnly(e.target.value).slice(0, 14) : e.target.value)
              }
            />
          ))}
      </div>
    </div>
  );
}

function summaryBits(key: ScenarioKeyState) {
  const bits: string[] = [];
  if (key.document_model) bits.push(displayValue(DOCUMENT_CRITERIA[0], key.document_model));
  if (key.cfop) bits.push(`CFOP ${key.cfop}`);
  if (key.vendor_cnpj) bits.push(formatCNPJ(key.vendor_cnpj));
  if (key.purchase_order_type) bits.push(`tipo ${key.purchase_order_type}`);
  if (key.plant) bits.push(`centro ${key.plant}`);
  if (key.purchasing_organization) bits.push(`org. ${key.purchasing_organization}`);
  return bits;
}

export function ResolutionCriteriaCard({
  keyState,
  onChange,
  companies,
  isActive,
  onActiveChange,
  companyLocked = false
}: {
  keyState: ScenarioKeyState;
  onChange: (next: ScenarioKeyState) => void;
  companies: ApiCompany[];
  isActive?: boolean;
  onActiveChange?: (active: boolean) => void;
  companyLocked?: boolean;
}) {
  const company = companies.find((c) => c.id === keyState.organization_company_id);
  const bits = summaryBits(keyState);
  const patch = (field: keyof ScenarioKeyState, value: string) => onChange({ ...keyState, [field]: value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quando aplicar</CardTitle>
        <CardDescription>
          {companyLocked
            ? 'Este fluxo vale só para esta empresa. Ligue um filtro só se quiser restringir (modelo, CFOP, fornecedor…). Desligado vale para qualquer nota.'
            : 'A empresa é obrigatória. Ligue um filtro só se quiser restringir (modelo, CFOP, fornecedor…). Desligado vale para qualquer nota. As alterações entram em vigor ao salvar.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="space-y-2">
          <Label>Empresa</Label>
          {companyLocked ? (
            <div className="rounded-md border px-3 py-2.5 text-sm font-medium">
              {company?.legal_name ?? 'Empresa atual'}
            </div>
          ) : (
            <Select
              value={keyState.organization_company_id}
              onValueChange={(v) => patch('organization_company_id', v)}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Selecione a empresa destinatária" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="bg-muted/40 rounded-xl border px-4 py-3 text-sm">
          {company ? (
            <p>
              Aplica a <span className="font-medium">{company.legal_name}</span>
              {bits.length === 0 ? (
                <span className="text-muted-foreground">, em qualquer nota fiscal.</span>
              ) : (
                <>
                  {' '}
                  quando <span className="font-medium">{bits.join(' · ')}</span>.
                </>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">Selecione a empresa para ver o resumo deste fluxo.</p>
          )}
        </div>

        <section className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Documento</p>
          {DOCUMENT_CRITERIA.map((def) => (
            <CriterionRow
              key={def.field}
              def={def}
              value={keyState[def.field]}
              onChange={(v) => patch(def.field, v)}
            />
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Fornecedor e compras
          </p>
          {PURCHASE_CRITERIA.map((def) => (
            <CriterionRow
              key={def.field}
              def={def}
              value={keyState[def.field]}
              onChange={(v) => patch(def.field, v)}
            />
          ))}
        </section>

        {onActiveChange && (
          <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Cenário ativo</p>
              <p className="text-muted-foreground text-xs">Notas novas só usam este fluxo se estiver ligado.</p>
            </div>
            <Switch checked={!!isActive} onCheckedChange={onActiveChange} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function resolutionChipLabels(key: {
  document_model?: string | null;
  cfop?: string | null;
  vendor_cnpj?: string | null;
  plant?: string | null;
  purchase_order_type?: string | null;
}) {
  const chips: string[] = [];
  if (key.document_model) chips.push(displayValue(DOCUMENT_CRITERIA[0], key.document_model));
  if (key.cfop) chips.push(`CFOP ${key.cfop}`);
  if (key.vendor_cnpj) chips.push(formatCNPJ(key.vendor_cnpj));
  if (key.purchase_order_type) chips.push(`Tipo ${key.purchase_order_type}`);
  if (key.plant) chips.push(`Centro ${key.plant}`);
  return chips;
}
