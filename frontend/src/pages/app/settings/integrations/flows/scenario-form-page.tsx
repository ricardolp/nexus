import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  createInboundScenario,
  getInboundScenario,
  listCompanies,
  updateInboundScenario,
  type CreateInboundScenarioInput,
  type InboundScenarioRuleInput
} from '@/lib/endpoints';
import type { ApiInboundScenarioRule } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_SCENARIO_RULE,
  FAILURE_ACTIONS,
  PO_MISSING_ACTIONS,
  PO_NOT_FOUND_ACTIONS,
  PO_REFERENCE_LEVELS,
  PO_REFERENCE_POLICIES,
  PO_RESOLUTION_MODES,
  PROCESS_TEMPLATES
} from './templates';
import { companyPath } from '../../companies/paths';
import { ResolutionCriteriaCard, type ScenarioKeyState } from './resolution-criteria';
import { buildPipelineSteps, StepPipeline } from './step-pipeline';
import { StepFlowEditor, type FlowStep } from './step-flow-editor';
import { EmailChipsInput } from './email-chips-input';

const EMPTY_KEY: ScenarioKeyState = {
  organization_company_id: '',
  document_model: '',
  purchase_order_type: '',
  cfop: '',
  vendor_cnpj: '',
  plant: '',
  purchasing_organization: ''
};

// The GET response's rule object carries read-only columns (scenario_id,
// created_at, updated_at) alongside the editable fields — the backend's
// PATCH decoder rejects unknown fields, so round-tripping the raw API
// object back as the request body 422s every save. Pick only the fields
// InboundScenarioRuleInput declares.
function toRuleInput(rule: ApiInboundScenarioRule): InboundScenarioRuleInput {
  return {
    po_reference_policy: rule.po_reference_policy,
    po_reference_level: rule.po_reference_level,
    po_missing_action: rule.po_missing_action,
    po_resolution_mode: rule.po_resolution_mode,
    po_not_found_action: rule.po_not_found_action,
    validate_vendor: rule.validate_vendor,
    vendor_failure_action: rule.vendor_failure_action,
    vendor_override_allowed: rule.vendor_override_allowed,
    validate_material: rule.validate_material,
    material_failure_action: rule.material_failure_action,
    material_override_allowed: rule.material_override_allowed,
    validate_quantity: rule.validate_quantity,
    quantity_tolerance_percent: rule.quantity_tolerance_percent,
    validate_price: rule.validate_price,
    price_tolerance_percent: rule.price_tolerance_percent,
    validate_tax: rule.validate_tax,
    tax_failure_action: rule.tax_failure_action,
    receipt_mode: rule.receipt_mode,
    inbound_delivery_mode: rule.inbound_delivery_mode,
    goods_receipt_mode: rule.goods_receipt_mode,
    goods_receipt_movement_type: rule.goods_receipt_movement_type,
    supplier_invoice_mode: rule.supplier_invoice_mode,
    notify_on_reject: rule.notify_on_reject,
    create_occurrence_on_reject: rule.create_occurrence_on_reject,
    notify_vendor_on_reject: rule.notify_vendor_on_reject,
    sefaz_event_on_reject: rule.sefaz_event_on_reject,
    responsible_emails: rule.responsible_emails ?? []
  };
}

function selectField<K extends keyof InboundScenarioRuleInput>(
  label: string,
  value: InboundScenarioRuleInput[K],
  options: { value: string; label: string }[],
  onChange: (v: string) => void
) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ScenarioFormPage() {
  const { companyId, scenarioId } = useParams<{ companyId: string; scenarioId: string }>();
  const isEditing = scenarioId !== 'new';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const scopedCompanyId = companyId ?? searchParams.get('company_id') ?? '';
  const backUrl = scopedCompanyId ? companyPath(scopedCompanyId, 'process-flows') : '/app/settings/companies';

  const enabled = !!token && !!organizationId;

  const scenarioQuery = useQuery({
    queryKey: ['inbound-scenario', organizationId, scenarioId],
    queryFn: () => getInboundScenario(token!, organizationId!, scenarioId!),
    enabled: enabled && isEditing
  });

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled
  });
  const companies = companiesQuery.data?.items ?? [];

  const [key, setKey] = useState<ScenarioKeyState>(() =>
    isEditing
      ? { ...EMPTY_KEY, organization_company_id: scopedCompanyId }
      : {
          ...EMPTY_KEY,
          organization_company_id: scopedCompanyId || searchParams.get('company_id') || '',
          document_model: searchParams.get('document_model') ?? '',
          cfop: searchParams.get('cfop') ?? '',
          vendor_cnpj: searchParams.get('vendor_cnpj') ?? ''
        }
  );
  const [templateCode, setTemplateCode] = useState(PROCESS_TEMPLATES[0].code);
  const [isActive, setIsActive] = useState(true);
  const [rule, setRule] = useState<InboundScenarioRuleInput>(DEFAULT_SCENARIO_RULE);

  useEffect(() => {
    const scenario = scenarioQuery.data;
    if (!isEditing || !scenario) return;
    setKey({
      organization_company_id: scopedCompanyId || scenario.scenario.organization_company_id,
      document_model: scenario.scenario.document_model ?? '',
      purchase_order_type: scenario.scenario.purchase_order_type ?? '',
      cfop: scenario.scenario.cfop ?? '',
      vendor_cnpj: scenario.scenario.vendor_cnpj ?? '',
      plant: scenario.scenario.plant ?? '',
      purchasing_organization: scenario.scenario.purchasing_organization ?? ''
    });
    setTemplateCode(scenario.scenario.process_template_code);
    setIsActive(scenario.scenario.is_active);
    setRule({ ...DEFAULT_SCENARIO_RULE, ...toRuleInput(scenario.rule) });
  }, [isEditing, scenarioQuery.data, scopedCompanyId]);

  const patchRule = <K extends keyof InboundScenarioRuleInput>(field: K, value: InboundScenarioRuleInput[K]) =>
    setRule((prev) => ({ ...prev, [field]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const organizationCompanyId = scopedCompanyId || key.organization_company_id;
      if (isEditing) {
        if (!organizationCompanyId) throw new Error('Selecione a empresa.');
        return updateInboundScenario(token!, organizationId!, scenarioId!, {
          organization_company_id: organizationCompanyId,
          document_model: key.document_model || undefined,
          purchase_order_type: key.purchase_order_type || undefined,
          cfop: key.cfop || undefined,
          vendor_cnpj: key.vendor_cnpj || undefined,
          plant: key.plant || undefined,
          purchasing_organization: key.purchasing_organization || undefined,
          process_template_code: templateCode,
          is_active: isActive,
          rule
        });
      }
      if (!organizationCompanyId) throw new Error('Selecione a empresa.');
      const input: CreateInboundScenarioInput = {
        organization_company_id: organizationCompanyId,
        document_model: key.document_model || undefined,
        purchase_order_type: key.purchase_order_type || undefined,
        cfop: key.cfop || undefined,
        vendor_cnpj: key.vendor_cnpj || undefined,
        plant: key.plant || undefined,
        purchasing_organization: key.purchasing_organization || undefined,
        process_template_code: templateCode,
        rule
      };
      return createInboundScenario(token!, organizationId!, input);
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Cenário atualizado' : 'Cenário criado');
      queryClient.invalidateQueries({ queryKey: ['inbound-scenarios', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['inbound-scenario', organizationId, scenarioId] });
      navigate(backUrl);
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Não foi possível salvar o cenário.'
      );
    }
  });

  if (isEditing && scenarioQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isEditing && (scenarioQuery.isError || !scenarioQuery.data)) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="font-medium">Cenário não encontrado</p>
          <p className="text-muted-foreground text-sm">
            {scenarioQuery.error instanceof ApiError
              ? scenarioQuery.error.message
              : 'O cenário solicitado não existe ou foi removido.'}
          </p>
          <Button asChild variant="outline" className="w-fit">
            <Link to={backUrl}>Voltar para fluxos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const selectedTemplate = PROCESS_TEMPLATES.find((t) => t.code === templateCode) ?? PROCESS_TEMPLATES[0];

  const purchaseOrderDetails = (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {selectField('Referência de pedido', rule.po_reference_policy, PO_REFERENCE_POLICIES, (v) =>
        patchRule('po_reference_policy', v)
      )}
      {selectField('Onde a referência aparece', rule.po_reference_level, PO_REFERENCE_LEVELS, (v) =>
        patchRule('po_reference_level', v)
      )}
      {selectField('Se a referência estiver ausente', rule.po_missing_action, PO_MISSING_ACTIONS, (v) =>
        patchRule('po_missing_action', v)
      )}
      {selectField('Como resolver o pedido', rule.po_resolution_mode, PO_RESOLUTION_MODES, (v) =>
        patchRule('po_resolution_mode', v)
      )}
      <div className="sm:col-span-2 sm:max-w-[calc(50%-0.75rem)]">
        {selectField('Se o pedido não for encontrado', rule.po_not_found_action, PO_NOT_FOUND_ACTIONS, (v) =>
          patchRule('po_not_found_action', v)
        )}
      </div>
    </div>
  );

  const goodsReceiptDetails = (
    <div className="max-w-sm space-y-1">
      <Label>Tipo de movimento (MIGO)</Label>
      <Input
        value={rule.goods_receipt_movement_type}
        onChange={(e) => patchRule('goods_receipt_movement_type', e.target.value)}
        placeholder="101"
      />
      <p className="text-muted-foreground text-xs">
        Código do tipo de movimento usado ao lançar o recebimento de mercadoria no SAP (ex.: 101).
      </p>
    </div>
  );

  const flowSteps: FlowStep[] = buildPipelineSteps(selectedTemplate.steps, rule).map((step) => ({
    ...step,
    details:
      step.type === 'CREATE_PURCHASE_ORDER'
        ? purchaseOrderDetails
        : step.type === 'POST_GOODS_RECEIPT'
          ? goodsReceiptDetails
          : undefined
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 overflow-hidden rounded-xl border p-5 shadow-sm md:p-6">
        <div
          className="-m-5 flex flex-col gap-4 p-5 md:-m-6 md:p-6"
          style={{
            backgroundImage:
              'linear-gradient(to right in srgb, color-mix(in srgb, var(--primary) 14%, transparent), transparent)'
          }}
        >
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
            <Link to={backUrl}>
              <ChevronLeftIcon className="mr-1 size-4" />
              Voltar
            </Link>
          </Button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {isEditing ? 'Editar fluxo de processo' : 'Novo fluxo de processo'}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm">
                Define para quais notas este fluxo vale, qual o modelo de processo no SAP e quais etapas rodam
                automaticamente.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={backUrl}>Cancelar</Link>
              </Button>
              <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar fluxo'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ResolutionCriteriaCard
        keyState={key}
        onChange={setKey}
        companies={companies}
        isActive={isActive}
        onActiveChange={setIsActive}
        companyLocked={Boolean(scopedCompanyId)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Modelo de processo</CardTitle>
          <CardDescription>A sequência de etapas do SAP que este cenário segue.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {PROCESS_TEMPLATES.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => setTemplateCode(t.code)}
              className={`rounded-md border p-4 text-left ${
                templateCode === t.code ? 'border-primary bg-primary/10' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.label}</span>
                {templateCode === t.code && <Badge>Selecionado</Badge>}
              </div>
              <p className="text-muted-foreground text-xs">{t.description}</p>
              <div className="mt-3 overflow-x-auto">
                <StepPipeline steps={t.steps.map((type) => ({ type }))} size="sm" />
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas do SAP</CardTitle>
          <CardDescription>
            Escolha o modo de cada etapa: desabilitada, automática (roda sozinha) ou manual (aguarda alguém
            executar na aba Integração da nota fiscal). O ícone de engrenagem abre os dados específicos daquela
            etapa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepFlowEditor
            steps={flowSteps}
            onModeChange={(type, mode) => {
              if (type === 'CREATE_INBOUND_DELIVERY') patchRule('inbound_delivery_mode', mode);
              if (type === 'POST_GOODS_RECEIPT') patchRule('goods_receipt_mode', mode);
              if (type === 'POST_SUPPLIER_INVOICE') patchRule('supplier_invoice_mode', mode);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validações</CardTitle>
          <CardDescription>O que é comparado entre a NF-e e o SAP, e o que fazer quando diverge.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Switch checked={rule.validate_vendor} onCheckedChange={(v) => patchRule('validate_vendor', v)} />
              <Label className="font-normal">Validar fornecedor</Label>
            </div>
            {rule.validate_vendor && (
              <>
                {selectField('Se a validação falhar', rule.vendor_failure_action, FAILURE_ACTIONS, (v) =>
                  patchRule('vendor_failure_action', v)
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.vendor_override_allowed}
                    onCheckedChange={(v) => patchRule('vendor_override_allowed', v)}
                  />
                  <Label className="font-normal">Permitir correção manual</Label>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Switch checked={rule.validate_material} onCheckedChange={(v) => patchRule('validate_material', v)} />
              <Label className="font-normal">Validar material</Label>
            </div>
            {rule.validate_material && (
              <>
                {selectField('Se a validação falhar', rule.material_failure_action, FAILURE_ACTIONS, (v) =>
                  patchRule('material_failure_action', v)
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.material_override_allowed}
                    onCheckedChange={(v) => patchRule('material_override_allowed', v)}
                  />
                  <Label className="font-normal">Permitir correção manual</Label>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Switch checked={rule.validate_quantity} onCheckedChange={(v) => patchRule('validate_quantity', v)} />
              <Label className="font-normal">Validar quantidade</Label>
            </div>
            {rule.validate_quantity && (
              <div className="max-w-40 space-y-1">
                <Label>Tolerância (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={rule.quantity_tolerance_percent}
                  onChange={(e) => patchRule('quantity_tolerance_percent', Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Switch checked={rule.validate_price} onCheckedChange={(v) => patchRule('validate_price', v)} />
              <Label className="font-normal">Validar preço</Label>
            </div>
            {rule.validate_price && (
              <div className="max-w-40 space-y-1">
                <Label>Tolerância (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={rule.price_tolerance_percent}
                  onChange={(e) => patchRule('price_tolerance_percent', Number(e.target.value))}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responsáveis</CardTitle>
          <CardDescription>
            E-mails notificados quando o fluxo for bloqueado (diferenças fora da tolerância, falha de
            validação) ou o documento for rejeitado. Digite o endereço e pressione ponto e vírgula (;)
            para adicionar outro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="responsible-emails">E-mails</Label>
          <EmailChipsInput
            id="responsible-emails"
            value={rule.responsible_emails ?? []}
            onChange={(emails) => patchRule('responsible_emails', emails)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Em caso de rejeição</CardTitle>
          <CardDescription>Ações disparadas quando o documento é rejeitado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['notify_on_reject', 'Notificar organização'],
              ['create_occurrence_on_reject', 'Criar ocorrência'],
              ['notify_vendor_on_reject', 'Notificar fornecedor'],
              ['sefaz_event_on_reject', 'Registrar evento na SEFAZ']
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="flex items-center gap-2">
              <Switch checked={rule[field]} onCheckedChange={(v) => patchRule(field, v)} />
              <Label className="font-normal">{label}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-2">
        <Button type="button" variant="outline" asChild>
          <Link to={backUrl}>Cancelar</Link>
        </Button>
        <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar fluxo'}
        </Button>
      </div>
    </div>
  );
}
