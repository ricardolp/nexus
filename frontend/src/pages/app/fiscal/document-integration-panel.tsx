import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  Building2Icon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  ClockIcon,
  PackageIcon,
  PlayIcon,
  ShoppingCartIcon,
  SkipForwardIcon,
  WorkflowIcon,
  WrenchIcon,
  XCircleIcon,
  ZapIcon
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  advanceInboundStep,
  createInboundScenario,
  getOrchestration,
  listDocumentEvents,
  listInboundScenarios,
  reprocessInboundDocument
} from '@/lib/endpoints';
import type { ApiInboundItem, ApiFiscalDocument, ApiInboundMatch, ApiInboundValidation, ApiPlanStep } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DEFAULT_SCENARIO_RULE, PROCESS_TEMPLATES } from '../settings/integrations/flows/templates';
import { COMPANIES_PATH, companyProcessFlowPath } from '../settings/companies/paths';
import { AdjustToPoDialog } from './adjust-to-po-dialog';
import { DocumentTimeline } from './document-timeline';
import { describeInboundEvent } from './event-descriptions';
import { formatDateTime, formatCurrency, formatQuantity, isInboundProcessing } from './format';
import { ItemTaxChips } from './nfe-tax-chips';
import {
  badgeFor as inboundBadgeFor,
  describeValidationMessage,
  itemStatusLabels,
  matchStatusLabels,
  stepStatusLabels,
  stepTypeLabels,
  validationSeverityRank,
  validationStatusLabels,
  validationTypeLabels
} from './inbound-labels';
import { badgeFor, processingStatusLabels, statusLabels } from './status-labels';

// Sentinel for expandedStepId when the "Resolução de fornecedor / material /
// pedido" preview row is expanded — never collides with a real step's uuid.
const PENDING_STEP_ID = '__pending__';

function matchFor(matches: ApiInboundMatch[], itemId: string | null, type: string) {
  return matches.find((m) => (m.organization_nfe_item_id ?? null) === itemId && m.match_type === type);
}

/** Worst-case status across an item and its material/PO matches — drives the card's accent color and CTA. */
function itemSeverity(
  item: ApiInboundItem,
  materialMatch: ApiInboundMatch | undefined,
  poMatch: ApiInboundMatch | undefined
): 'blocked' | 'action' | 'ok' {
  if (item.status === 'BLOCKED' || materialMatch?.status === 'BLOCKED' || poMatch?.status === 'BLOCKED') {
    return 'blocked';
  }
  if (
    item.status === 'NEEDS_CORRECTION' ||
    materialMatch?.status === 'NOT_FOUND' ||
    materialMatch?.status === 'MULTIPLE_MATCH' ||
    poMatch?.status === 'NOT_FOUND' ||
    poMatch?.status === 'MULTIPLE_MATCH'
  ) {
    return 'action';
  }
  return 'ok';
}

/** Visual language for a stepper node: which icon/ring color represents a plan step's status. */
function stepAccent(status: string): 'done' | 'problem' | 'current' | 'pending' {
  if (status === 'DONE' || status === 'SKIPPED') return 'done';
  if (status === 'FAILED' || status === 'BLOCKED') return 'problem';
  if (status === 'RUNNING' || status === 'READY' || status === 'AWAITING_MANUAL' || status === 'ACTION_REQUIRED') {
    return 'current';
  }
  return 'pending';
}

function StepNode({ accent, index }: { accent: 'done' | 'problem' | 'current' | 'pending'; index: number }) {
  const ring =
    accent === 'done'
      ? 'border-emerald-500/50 text-emerald-600'
      : accent === 'problem'
        ? 'border-red-500/50 text-red-600'
        : accent === 'current'
          ? 'border-primary/50 text-primary'
          : 'border-border text-muted-foreground';
  return (
    <div
      className={cn(
        'bg-background relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2',
        ring
      )}
    >
      {accent === 'done' && <CheckCircle2Icon className="size-4" />}
      {accent === 'problem' && <XCircleIcon className="size-4" />}
      {accent === 'current' && <ClockIcon className="size-4" />}
      {accent === 'pending' && <span className="text-xs font-medium tabular-nums">{index}</span>}
    </div>
  );
}

/** One matching field (material/pedido) as a from → to chip with its match-status badge. */
function MatchField({
  icon: Icon,
  label,
  from,
  to,
  match
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  from?: string | null;
  to?: string | null;
  match?: ApiInboundMatch;
}) {
  const badge = match ? inboundBadgeFor(matchStatusLabels, match.status) : null;
  return (
    <div className="bg-muted/30 flex items-start gap-2 rounded-md border p-2">
      <Icon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="flex flex-wrap items-center gap-1 font-mono text-xs">
          <span className={cn(!to && !from && 'text-muted-foreground')}>{from ?? '—'}</span>
          {to && to !== from && (
            <>
              <ArrowRightIcon className="text-muted-foreground size-3" />
              <span className="text-foreground font-medium">{to}</span>
            </>
          )}
        </p>
      </div>
      {badge && (
        <Badge variant="outline" className={cn('shrink-0 gap-1 text-[10px]', badge.className)}>
          {match?.status === 'MATCHED' ? (
            <CheckCircle2Icon className="size-3" />
          ) : (
            <CircleAlertIcon className="size-3" />
          )}
          {badge.label}
        </Badge>
      )}
    </div>
  );
}

/** Status icon for a validation checklist row — mirrors GitHub-style PR checks. */
function ValidationIcon({ status }: { status: string }) {
  if (status === 'PASS' || status === 'OVERRIDDEN') {
    return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
  }
  if (status === 'WARNING') {
    return <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />;
  }
  if (status === 'ACTION_REQUIRED' || status === 'BLOCKED') {
    return <XCircleIcon className="mt-0.5 size-4 shrink-0 text-red-600" />;
  }
  return <span className="border-muted-foreground/40 mt-1 size-2.5 shrink-0 rounded-full border" />;
}

// Matching, validações e plano de execução SAP para um documento fiscal —
// o corpo da tela de detalhe (fiscal-document-detail-page.tsx). Extraído
// como painel próprio para poder ser embutido em qualquer contexto sem
// depender de um Dialog/Sheet.
export function DocumentIntegrationPanel({
  document,
  companyName
}: {
  document: ApiFiscalDocument;
  companyName?: string;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('resumo');
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItemId, setAdjustItemId] = useState<string | undefined>(undefined);

  function openAdjust(itemId?: string) {
    setAdjustItemId(itemId);
    setAdjustOpen(true);
  }

  const orchestrationQuery = useQuery({
    queryKey: ['orchestration', organizationId, document.id],
    queryFn: () => getOrchestration(token!, organizationId!, document.id),
    enabled: !!token && !!organizationId,
    refetchInterval: isInboundProcessing(document.processing_status) ? 2000 : false
  });

  // Same query key DocumentTimeline uses below — React Query dedupes it, so
  // this doesn't add a second network round trip. Only the latest event is
  // used here, to explain *why* validations/plan are still empty.
  const eventsQuery = useQuery({
    queryKey: ['document-events', organizationId, document.id],
    queryFn: () => listDocumentEvents(token!, organizationId!, document.id),
    enabled: !!token && !!organizationId
  });
  const latestEvent = eventsQuery.data?.items.at(-1);
  const scenarioMissing = latestEvent?.event_type === 'fiscal.inbound.scenario_not_found.v1';
  const blockedInfo =
    document.status === 'ACTION_REQUIRED' && latestEvent ? describeInboundEvent(latestEvent) : null;

  const view = orchestrationQuery.data;
  const items = view?.items ?? [];
  const matches = view?.matches ?? [];
  const validations = useMemo(() => {
    const list = [...(view?.validations ?? [])];
    list.sort((a, b) => {
      const bySeverity = validationSeverityRank(a.status) - validationSeverityRank(b.status);
      if (bySeverity !== 0) return bySeverity;
      return a.validation_type.localeCompare(b.validation_type);
    });
    return list;
  }, [view?.validations]);
  const validationSummary = useMemo(() => {
    const counts = { action: 0, warning: 0, ok: 0, other: 0 };
    for (const v of validations) {
      if (v.status === 'ACTION_REQUIRED' || v.status === 'BLOCKED') counts.action += 1;
      else if (v.status === 'WARNING') counts.warning += 1;
      else if (v.status === 'PASS' || v.status === 'OVERRIDDEN') counts.ok += 1;
      else counts.other += 1;
    }
    return counts;
  }, [validations]);
  const steps = useMemo(() => [...(view?.steps ?? [])].sort((a, b) => a.sequence - b.sequence), [view?.steps]);
  const previewTemplate = view?.scenario
    ? PROCESS_TEMPLATES.find((t) => t.code === view.scenario!.scenario.process_template_code)
    : undefined;
  const planProgress = useMemo(() => {
    if (steps.length === 0) return null;
    const done = steps.filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
    const failed = steps.filter((s) => s.status === 'FAILED' || s.status === 'BLOCKED').length;
    const current = steps.find(
      (s) =>
        s.status === 'READY' ||
        s.status === 'RUNNING' ||
        s.status === 'AWAITING_MANUAL' ||
        s.status === 'ACTION_REQUIRED'
    );
    return { done, failed, total: steps.length, current };
  }, [steps]);

  // The single most relevant problem to surface at the top of the page — a
  // real step stuck on failure/manual action takes priority; if no plan has
  // even been built yet, fall back to the document-level block reason.
  const problemStep = steps.find(
    (s) =>
      s.status === 'FAILED' ||
      s.status === 'BLOCKED' ||
      s.status === 'ACTION_REQUIRED' ||
      s.status === 'AWAITING_MANUAL'
  );
  const banner = problemStep
    ? {
        critical: problemStep.status === 'FAILED' || problemStep.status === 'BLOCKED',
        title: `${stepTypeLabels[problemStep.step_type] ?? problemStep.step_type} ${
          problemStep.status === 'FAILED' ? 'falhou' : 'precisa de ação manual'
        }`,
        description:
          problemStep.error_message_sanitized ?? 'Corrija os dados do documento para que esta etapa possa seguir.',
        step: problemStep as ApiPlanStep | null
      }
    : steps.length === 0 && blockedInfo
      ? { critical: false, title: blockedInfo.title, description: blockedInfo.description, step: null }
      : null;

  const bootstrapScenarioMutation = useMutation({
    mutationFn: async () => {
      const companyId = document.organization_company_id;
      if (!companyId) throw new Error('Documento sem empresa associada.');
      const listed = await listInboundScenarios(token!, organizationId!);
      const hasCatchAll = listed.items.some(
        (s) =>
          s.scenario.organization_company_id === companyId &&
          s.scenario.is_active &&
          !s.scenario.document_model &&
          !s.scenario.cfop &&
          !s.scenario.vendor_cnpj
      );
      if (!hasCatchAll) {
        await createInboundScenario(token!, organizationId!, {
          organization_company_id: companyId,
          process_template_code: 'STANDARD_PURCHASE',
          rule: DEFAULT_SCENARIO_RULE
        });
      }
      return reprocessInboundDocument(token!, organizationId!, document.id);
    },
    onSuccess: () => {
      toast.success('Cenário aplicado. O matching com o SAP continua em segundo plano.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, document.id] });
      queryClient.invalidateQueries({ queryKey: ['orchestration', organizationId, document.id] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, document.id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-scenarios', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Não foi possível criar o cenário.');
    }
  });

  const newScenarioHref = (() => {
    const params = new URLSearchParams();
    if (document.organization_company_id) params.set('company_id', document.organization_company_id);
    const meta = latestEvent?.metadata_json && typeof latestEvent.metadata_json === 'object'
      ? (latestEvent.metadata_json as Record<string, unknown>)
      : {};
    if (typeof meta.document_model === 'string' && meta.document_model) params.set('document_model', meta.document_model);
    if (typeof meta.cfop === 'string' && meta.cfop) params.set('cfop', meta.cfop);
    if (typeof meta.vendor_cnpj === 'string' && meta.vendor_cnpj) params.set('vendor_cnpj', meta.vendor_cnpj);
    const qs = params.toString();
    if (document.organization_company_id) {
      return companyProcessFlowPath(document.organization_company_id, 'new', qs);
    }
    return COMPANIES_PATH;
  })();

  function resolveNow() {
    if (scenarioMissing) {
      bootstrapScenarioMutation.mutate();
      return;
    }
    setTab('plan');
    setExpandedStepId(banner?.step ? banner.step.id : PENDING_STEP_ID);
    openAdjust();
  }

  const vendorMatch = matchFor(matches, null, 'VENDOR');

  const itemNumberById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.id, item.item_number);
    return map;
  }, [items]);

  function validationItemLabel(v: ApiInboundValidation): string | null {
    if (!v.organization_nfe_item_id) return null;
    const n = itemNumberById.get(v.organization_nfe_item_id);
    return n != null ? `Item ${n}` : null;
  }

  const advanceMutation = useMutation({
    mutationFn: (input: { stepId: string; action: 'run' | 'skip'; reason?: string }) =>
      advanceInboundStep(token!, organizationId!, document.id, input.stepId, {
        action: input.action,
        reason: input.reason
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestration', organizationId, document.id] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível avançar a etapa.');
    }
  });

  if (orchestrationQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (orchestrationQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {orchestrationQuery.error instanceof ApiError
          ? orchestrationQuery.error.message
          : 'Não foi possível carregar a integração deste documento.'}
      </p>
    );
  }

  const statusBadge = badgeFor(statusLabels, document.status);
  const processingBadge = badgeFor(processingStatusLabels, document.processing_status);
  const totalValue = items.reduce((sum, item) => sum + item.total_amount, 0);

  // Shared by both the real per-step detail expansion (below) and the
  // "Resolução de fornecedor / material / pedido" preview pseudo-step —
  // matching happens once per document, before any real step exists, so
  // it's the same content either way. Without also making the preview row
  // expandable, a document that fails *before* a plan is ever built (e.g.
  // SAP unreachable during vendor matching) would have no way to reach the
  // override actions at all.
  const matchingDetail = (
    <div className="flex flex-col gap-3 p-4">
      {vendorMatch && (
        <div className="bg-background flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
            <Building2Icon className="text-muted-foreground size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Fornecedor</p>
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              <span className="font-mono text-sm">{vendorMatch.source_value ?? '—'}</span>
              {vendorMatch.resolved_value && vendorMatch.resolved_value !== vendorMatch.source_value && (
                <>
                  <ArrowRightIcon className="text-muted-foreground size-3.5" />
                  <span className="font-mono text-sm">{vendorMatch.resolved_value}</span>
                </>
              )}
            </p>
          </div>
          <Badge variant="outline" className={cn('gap-1', inboundBadgeFor(matchStatusLabels, vendorMatch.status).className)}>
            {inboundBadgeFor(matchStatusLabels, vendorMatch.status).label}
          </Badge>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const materialMatch = matchFor(matches, item.id, 'MATERIAL');
          const poMatch = matchFor(matches, item.id, 'PURCHASE_ORDER');
          const severity = itemSeverity(item, materialMatch, poMatch);
          const accent =
            severity === 'blocked'
              ? 'border-l-red-500 bg-red-500/[0.02]'
              : severity === 'action'
                ? 'border-l-amber-500 bg-amber-500/[0.02]'
                : 'border-l-emerald-500/50';

          return (
            <div key={item.id} className={cn('bg-background rounded-lg border border-l-4 p-3', accent)}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Item {item.item_number}
                    <span className="text-muted-foreground ml-2 font-normal">
                      {item.description || item.supplier_material_code || 'sem descrição'}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    {item.quantity} {item.unit ?? ''} · {formatCurrency(item.unit_price)}
                    {item.ncm ? ` · NCM ${item.ncm}` : ''}
                    {item.cfop ? ` · CFOP ${item.cfop}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className={inboundBadgeFor(itemStatusLabels, item.status).className}>
                    {inboundBadgeFor(itemStatusLabels, item.status).label}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant={severity === 'ok' ? 'outline' : 'default'}
                    className={severity === 'blocked' ? 'bg-red-600 hover:bg-red-600/90' : undefined}
                    onClick={() => openAdjust(item.id)}
                  >
                    <WrenchIcon />
                    {severity === 'ok' ? 'Revisar' : 'Ajustar ao pedido'}
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <MatchField
                  icon={PackageIcon}
                  label="Material"
                  from={item.supplier_material_code}
                  to={item.resolved_material_code}
                  match={materialMatch}
                />
                <MatchField
                  icon={ShoppingCartIcon}
                  label="Pedido"
                  from={
                    item.purchase_order_reference_raw
                      ? `${item.purchase_order_reference_raw}${item.purchase_order_item_reference_raw ? ` / ${item.purchase_order_item_reference_raw}` : ''}`
                      : null
                  }
                  to={
                    item.resolved_purchase_order_number
                      ? `${item.resolved_purchase_order_number}${item.resolved_purchase_order_item ? ` / ${item.resolved_purchase_order_item}` : ''}`
                      : null
                  }
                  match={poMatch}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const summaryRows: { label: string; value: string; highlight?: boolean; mono?: boolean }[] = [
    { label: 'Empresa', value: companyName ?? document.organization_company_id },
    { label: 'Fonte', value: document.source_system },
    { label: 'Ambiente', value: document.environment === 'production' ? 'Produção' : 'Homologação' },
    {
      label: 'Valor total dos itens',
      value: totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      highlight: true
    },
    { label: 'Recebido em', value: formatDateTime(document.received_at) },
    { label: 'Concluído em', value: formatDateTime(document.completed_at) },
    { label: 'Emitente (CNPJ)', value: document.issuer_cnpj ?? '—' },
    { label: 'Destinatário (documento)', value: document.recipient_document ?? '—' },
    { label: 'Chave de acesso', value: document.access_key ?? '—', mono: true },
    { label: 'ID de correlação', value: document.correlation_id, mono: true }
  ];

  return (
    <>
      {banner && (
        <div
          className={cn(
            'mb-4 flex flex-wrap items-center gap-4 rounded-xl border p-4',
            banner.critical ? 'border-red-500/30 bg-red-500/[0.04]' : 'border-amber-500/30 bg-amber-500/[0.04]'
          )}
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              banner.critical ? 'bg-red-500/15 text-red-600' : 'bg-amber-500/15 text-amber-600'
            )}
          >
            {banner.critical ? <XCircleIcon className="size-5" /> : <AlertTriangleIcon className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{banner.title}</p>
            {banner.description && <p className="text-muted-foreground mt-0.5 text-sm">{banner.description}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {scenarioMissing && (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to={newScenarioHref}>Configurar manualmente</Link>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className={cn('shrink-0', banner.critical && 'bg-red-600 hover:bg-red-600/90')}
              onClick={resolveNow}
              disabled={scenarioMissing && bootstrapScenarioMutation.isPending}
            >
              {scenarioMissing ? <WorkflowIcon /> : <ZapIcon />}
              {scenarioMissing
                ? bootstrapScenarioMutation.isPending
                  ? 'Aplicando…'
                  : 'Criar cenário e reprocessar'
                : 'Corrigir agora'}
            </Button>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
          <TabsTrigger value="items">
            Itens
            {items.length > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums" variant="secondary">
                {items.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="taxes">Impostos</TabsTrigger>
          <TabsTrigger value="validations">
            Validações
            {validationSummary.action > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 rounded-full bg-red-600 px-1 text-[10px] tabular-nums">
                {validationSummary.action}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="plan">
            Plano de execução
            {planProgress && planProgress.failed > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 rounded-full bg-red-600 px-1 text-[10px] tabular-nums">
                {planProgress.failed}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="pt-4">
          <div className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <span className="text-sm font-medium">Resumo fiscal</span>
              <div className="flex gap-2">
                <Badge variant="outline" className={cn('gap-1.5 font-normal', statusBadge.className)}>
                  <span className={cn('size-1.5 rounded-full', statusBadge.dot)} />
                  {statusBadge.label}
                </Badge>
                <Badge variant="outline" className={cn('gap-1.5 font-normal', processingBadge.className)}>
                  <span className={cn('size-1.5 rounded-full', processingBadge.dot)} />
                  {processingBadge.label}
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              {summaryRows.map((row) => (
                <div
                  key={row.label}
                  className={cn('rounded-md border px-3 py-2 text-sm', row.highlight && 'border-primary/20 bg-primary/5')}
                >
                  <p className="text-muted-foreground text-xs">{row.label}</p>
                  <p
                    className={cn(
                      'mt-0.5 font-medium',
                      row.mono && 'font-mono text-xs break-all',
                      row.highlight && 'text-primary tabular-nums'
                    )}
                  >
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <DocumentTimeline documentId={document.id} />
        </TabsContent>

        <TabsContent value="items" className="pt-4">
          <p className="text-muted-foreground mb-3 text-xs">
            Dados extraídos da nota fiscal, como recebida — sempre os valores originais. Correspondência com o
            SAP e correções manuais ficam no detalhe de cada etapa, na aba Plano de execução.
          </p>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isInboundProcessing(document.processing_status)
                ? 'Extraindo itens do XML em segundo plano…'
                : 'Nenhum item extraído para este documento.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <Badge variant="outline" className="mr-2 font-mono font-normal tabular-nums">
                          {item.item_number}
                        </Badge>
                        {item.description || item.supplier_material_code || 'sem descrição'}
                      </p>
                      <p className="text-muted-foreground mt-1 font-mono text-xs">
                        {item.supplier_material_code ?? '—'}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">
                      {formatCurrency(item.total_amount)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.ncm && (
                      <Badge variant="outline" className="font-mono font-normal">
                        NCM {item.ncm}
                      </Badge>
                    )}
                    {item.cfop && (
                      <Badge variant="secondary" className="font-mono font-normal">
                        CFOP {item.cfop}
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-normal tabular-nums">
                      {formatQuantity(item.quantity)} {item.unit ?? ''}
                    </Badge>
                    <Badge variant="outline" className="font-normal tabular-nums">
                      {formatCurrency(item.unit_price)} / un.
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <ItemTaxChips taxes={item.taxes} />
                  </div>
                </div>
              ))}
              <div className="flex justify-end border-t pt-3">
                <p className="text-sm font-medium tabular-nums">
                  Total dos itens {formatCurrency(totalValue)}
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="taxes" className="pt-4">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isInboundProcessing(document.processing_status)
                ? 'Extraindo impostos do XML em segundo plano…'
                : 'Nenhum imposto extraído para este documento.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs">
                Impostos destacados por item (ICMS, IPI, PIS e COFINS). Os totais da nota ficam no cartão acima.
              </p>
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      Item {item.item_number}
                      <span className="text-muted-foreground ml-2 font-normal">
                        {item.description || item.supplier_material_code || 'sem descrição'}
                      </span>
                    </p>
                    <span className="text-sm tabular-nums">{formatCurrency(item.total_amount)}</span>
                  </div>
                  <ItemTaxChips taxes={item.taxes} />
                  {!item.taxes && (
                    <p className="text-muted-foreground text-xs">Sem impostos destacados neste item.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="validations" className="pt-4">
          {validations.length === 0 ? (
            blockedInfo ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium">{blockedInfo.title}</p>
                  {blockedInfo.description && (
                    <p className="text-muted-foreground mt-0.5">{blockedInfo.description}</p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    O documento ainda não chegou à etapa de validação — por isso não há nada listado aqui.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma validação registrada.</p>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {validationSummary.action > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1.5 bg-red-500/10 font-normal text-red-700 dark:text-red-400"
                  >
                    <span className="size-1.5 rounded-full bg-red-500" />
                    {validationSummary.action} com ação necessária
                  </Badge>
                )}
                {validationSummary.warning > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1.5 bg-amber-500/10 font-normal text-amber-600 dark:text-amber-400"
                  >
                    <span className="size-1.5 rounded-full bg-amber-400" />
                    {validationSummary.warning} com atenção
                  </Badge>
                )}
                {validationSummary.ok > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1.5 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400"
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    {validationSummary.ok} ok
                  </Badge>
                )}
                <p className="text-muted-foreground text-xs">
                  Compara dados da NF com o que foi resolvido no SAP. Corrija material/pedido na aba Plano de
                  execução.
                </p>
              </div>

              <div className="divide-y rounded-lg border">
                {validations.map((v) => {
                  const itemLabel = validationItemLabel(v);
                  const detail = describeValidationMessage(
                    v.validation_type,
                    v.message,
                    v.expected_value,
                    v.actual_value
                  );
                  const showCompare =
                    (v.expected_value != null && v.expected_value !== '') ||
                    (v.actual_value != null && v.actual_value !== '');
                  const failing = v.status === 'ACTION_REQUIRED' || v.status === 'BLOCKED';
                  return (
                    <div
                      key={v.id}
                      className={cn('flex items-start gap-3 p-3', failing && 'bg-red-500/[0.03]')}
                    >
                      <ValidationIcon status={v.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {validationTypeLabels[v.validation_type] ?? v.validation_type}
                          </span>
                          {itemLabel && (
                            <Badge variant="outline" className="text-muted-foreground text-[10px] font-normal">
                              {itemLabel}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-sm">{detail}</p>
                        {showCompare && (
                          <p className="mt-1 inline-flex flex-wrap items-center gap-1 font-mono text-xs">
                            <span className="text-muted-foreground">{v.expected_value ?? '—'}</span>
                            <ArrowRightIcon className="text-muted-foreground size-3" />
                            <span>{v.actual_value ?? '—'}</span>
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('shrink-0 font-normal', inboundBadgeFor(validationStatusLabels, v.status).className)}
                      >
                        {inboundBadgeFor(validationStatusLabels, v.status).label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="plan" className="pt-4">
          {steps.length === 0 ? (
            <div className="flex flex-col gap-4">
              {previewTemplate ? (
                <>
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Fluxo previsto · {previewTemplate.label}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Ainda não iniciado. Use <span className="text-foreground font-medium">Ajustar</span> para
                      alinhar a NF ao pedido do SAP e reprocessar a validação.
                    </p>
                    {view?.scenario?.scenario.process_template_code && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Template:{' '}
                        <span className="text-foreground font-mono">
                          {view.scenario.scenario.process_template_code}
                        </span>
                        {view.scenario.scenario.cfop && <> · CFOP {view.scenario.scenario.cfop}</>}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <div className="relative flex gap-3">
                      <div
                        className="bg-border absolute top-8 left-[15px] w-px"
                        style={{ height: 'calc(100% - 2rem)' }}
                      />
                      <StepNode accent="problem" index={0} />
                      <div className="min-w-0 flex-1 pb-4">
                        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.03] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p
                              className="cursor-pointer text-sm font-medium"
                              onClick={() =>
                                setExpandedStepId(expandedStepId === PENDING_STEP_ID ? null : PENDING_STEP_ID)
                              }
                            >
                              Resolução de fornecedor / material / pedido
                            </p>
                            <Button type="button" size="sm" onClick={() => openAdjust()}>
                              <WrenchIcon />
                              Ajustar
                            </Button>
                          </div>
                          <button
                            type="button"
                            className="text-muted-foreground mt-1 flex items-center gap-1 text-xs hover:underline"
                            onClick={() =>
                              setExpandedStepId(expandedStepId === PENDING_STEP_ID ? null : PENDING_STEP_ID)
                            }
                          >
                            {expandedStepId === PENDING_STEP_ID ? (
                              <ChevronUpIcon className="size-3" />
                            ) : (
                              <ChevronDownIcon className="size-3" />
                            )}
                            Ver correspondência SAP
                          </button>
                        </div>
                        {expandedStepId === PENDING_STEP_ID && (
                          <div className="bg-muted/30 mt-2 rounded-lg border">{matchingDetail}</div>
                        )}
                      </div>
                    </div>

                    {previewTemplate.steps.map((stepType, idx) => {
                      const isLast = idx === previewTemplate.steps.length - 1;
                      return (
                        <div key={stepType} className="relative flex gap-3">
                          {!isLast && (
                            <div
                              className="bg-border absolute top-8 left-[15px] w-px"
                              style={{ height: 'calc(100% - 2rem)' }}
                            />
                          )}
                          <StepNode accent="pending" index={idx + 1} />
                          <div className="min-w-0 flex-1 pb-4">
                            <div className="rounded-lg border border-dashed p-3">
                              <p className="text-muted-foreground text-sm">
                                {stepTypeLabels[stepType] ?? stepType}
                              </p>
                              <p className="text-muted-foreground mt-0.5 text-xs">Não iniciado</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum cenário de integração foi resolvido para este documento.{' '}
                  <Link className="text-foreground underline-offset-4 hover:underline" to={newScenarioHref}>
                    Configure um em Fluxos de processo
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {previewTemplate?.label ?? 'Plano de execução'}
                      {view?.plan?.version != null && (
                        <span className="text-muted-foreground ml-2 font-normal">v{view.plan.version}</span>
                      )}
                    </p>
                    {view?.scenario?.scenario.process_template_code && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Template {view.scenario.scenario.process_template_code}
                        {view.scenario.scenario.cfop && ` · CFOP ${view.scenario.scenario.cfop}`}
                      </p>
                    )}
                    {planProgress?.current && (
                      <p className="mt-2 text-xs">
                        Etapa atual:{' '}
                        <span className="font-medium">
                          {stepTypeLabels[planProgress.current.step_type] ?? planProgress.current.step_type}
                        </span>
                      </p>
                    )}
                  </div>
                  {planProgress && (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="font-normal tabular-nums">
                        {planProgress.done}/{planProgress.total} concluídas
                      </Badge>
                      {planProgress.failed > 0 && (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 font-normal text-red-600 dark:text-red-400"
                        >
                          {planProgress.failed} com falha
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                {planProgress && planProgress.total > 0 && (
                  <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        planProgress.failed > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                      style={{ width: `${Math.round((planProgress.done / planProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Abra uma etapa para ver a correspondência com o SAP (fornecedor, material, pedido) e corrigir
                manualmente quando necessário.
              </p>

              <div className="flex flex-col">
                {steps.map((step: ApiPlanStep, idx) => {
                  const canAdvance =
                    step.status === 'AWAITING_MANUAL' ||
                    step.status === 'ACTION_REQUIRED' ||
                    step.status === 'FAILED';
                  const expanded = expandedStepId === step.id;
                  const isCurrent = planProgress?.current?.id === step.id;
                  const accent = stepAccent(step.status);
                  const isLast = idx === steps.length - 1;
                  const canAjustar = canAdvance || step.status === 'ACTION_REQUIRED' || document.status === 'ACTION_REQUIRED';

                  return (
                    <div key={step.id} className="relative flex gap-3">
                      {!isLast && (
                        <div
                          className="bg-border absolute top-8 left-[15px] w-px"
                          style={{ height: 'calc(100% - 2rem)' }}
                        />
                      )}
                      <StepNode accent={accent} index={step.sequence} />
                      <div className="min-w-0 flex-1 pb-4">
                        <div
                          className={cn(
                            'rounded-lg border p-3',
                            accent === 'problem' && 'border-red-500/30 bg-red-500/[0.03]',
                            isCurrent && accent !== 'problem' && 'border-primary/30 bg-primary/[0.03]'
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{stepTypeLabels[step.step_type] ?? step.step_type}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="font-normal">
                                  {step.mode === 'AUTO' ? 'Automático' : 'Manual'}
                                </Badge>
                                <Badge variant="outline" className={inboundBadgeFor(stepStatusLabels, step.status).className}>
                                  {inboundBadgeFor(stepStatusLabels, step.status).label}
                                </Badge>
                                {step.sap_document_number && (
                                  <span className="text-muted-foreground font-mono text-xs">
                                    SAP {step.sap_document_number}
                                  </span>
                                )}
                              </div>
                              {isCurrent && (
                                <p className="text-muted-foreground mt-1 text-xs">Em andamento agora</p>
                              )}
                              {step.status === 'FAILED' && step.error_message_sanitized && (
                                <p className="text-destructive mt-1.5 text-xs">{step.error_message_sanitized}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              {canAjustar && (
                                <Button type="button" size="sm" variant="outline" onClick={() => openAdjust()}>
                                  <WrenchIcon />
                                  Ajustar
                                </Button>
                              )}
                              {canAdvance && (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={advanceMutation.isPending}
                                    onClick={() => advanceMutation.mutate({ stepId: step.id, action: 'run' })}
                                  >
                                    <PlayIcon />
                                    Executar
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={advanceMutation.isPending}
                                    onClick={() =>
                                      advanceMutation.mutate({
                                        stepId: step.id,
                                        action: 'skip',
                                        reason: 'Pulado manualmente pelo usuário'
                                      })
                                    }
                                  >
                                    <SkipForwardIcon />
                                    Pular
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-muted-foreground mt-2 flex items-center gap-1 text-xs hover:underline"
                            onClick={() => setExpandedStepId(expanded ? null : step.id)}
                          >
                            {expanded ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
                            Ver correspondência SAP
                          </button>
                        </div>
                        {expanded && <div className="bg-muted/30 mt-2 rounded-lg border">{matchingDetail}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AdjustToPoDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        documentId={document.id}
        items={items}
        initialItemId={adjustItemId}
        vendorCnpj={vendorMatch?.source_value ?? document.issuer_cnpj ?? undefined}
        organizationCompanyId={document.organization_company_id}
        canReprocess={document.status === 'ACTION_REQUIRED'}
      />
    </>
  );
}
