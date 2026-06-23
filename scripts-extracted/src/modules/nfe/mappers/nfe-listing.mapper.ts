import type { nfeDocuments, nfeInboundProcess } from "../../../db/nfe-schema.js";
import {
  inboundStatusRank,
  mapInboundToStatusInterno,
  STATUS_INTERNO_LABELS,
  INBOUND_STATUS_LABELS,
  type NfeInboundStatus,
  type StatusInterno,
} from "../inbound/inbound-status.js";

export type NotaFiscalFluxo = "inbound" | "outbound";

export type NotaFiscalStatusSefaz =
  | "autorizada"
  | "pendente"
  | "rejeitada"
  | "em_processamento"
  | "cancelada";

export type NotaFiscalIntegracaoTipo = "sync" | "pending" | "error";

export type NotaFiscal = {
  id: string;
  fluxo: NotaFiscalFluxo;
  numero: string;
  serie: string;
  modelo: "55" | "65";
  emissaoAt: string;
  ultimaAtualizacaoAt: string;
  emitenteDestinatario: string;
  cnpj: string;
  valorTotal: number;
  statusSefaz: NotaFiscalStatusSefaz;
  integracaoLabel: string;
  integracaoTipo: NotaFiscalIntegracaoTipo;
  chaveAcesso: string;
  semXml: boolean;
  comErro: boolean;
  organizacaoId: string;
  organizacaoNome: string;
  companyId?: string;
  companyRazaoSocial?: string;
  inboundStatus?: NfeInboundStatus;
  inboundStatusLabel?: string;
  statusInterno?: StatusInterno;
  statusInternoLabel?: string;
  alertaInbound?: boolean;
};

export type NotasFiscaisSummary = {
  totalPeriodo: { valor: number; count: number };
  outbound: { valor: number; count: number };
  inbound: { valor: number; count: number };
  autorizadas: { valor: number; count: number };
  pendentes: { valor: number; count: number };
  rejeitadas: { valor: number; count: number };
};

export type StatusDistributionSlice = {
  status: NotaFiscalStatusSefaz;
  label: string;
  count: number;
  percentage: number;
  fill: string;
};

export type NotaFiscalAlert = {
  id: string;
  title: string;
  count: number;
  variant: "destructive" | "warning" | "info";
};

export type ModeloUsage = {
  modelo: string;
  label: string;
  percentage: number;
};

export type NotasFiscaisDashboardResponse = {
  summary: NotasFiscaisSummary;
  statusDistribution: StatusDistributionSlice[];
  alerts: NotaFiscalAlert[];
  modelosUsage: ModeloUsage[];
};

export type RecentEvent = {
  id: string;
  message: string;
  timestamp: string;
  type: "success" | "info" | "warning" | "error";
};

type DbStatus = (typeof nfeDocuments.$inferSelect)["status"];

const STATUS_TO_SEFAZ: Record<DbStatus, NotaFiscalStatusSefaz> = {
  authorized: "autorizada",
  rejected: "rejeitada",
  denied: "rejeitada",
  validation_error: "rejeitada",
  processing_error: "rejeitada",
  cancelled: "cancelada",
  cancel_requested: "cancelada",
  cancel_rejected: "cancelada",
  inutilized: "cancelada",
  sent_to_sefaz: "em_processamento",
  validating: "em_processamento",
  contingency: "em_processamento",
  draft: "pendente",
  received: "pendente",
  waiting_processing: "pendente",
  closed: "pendente",
};

export const STATUS_LABELS: Record<NotaFiscalStatusSefaz, string> = {
  autorizada: "Autorizada",
  pendente: "Pendente",
  rejeitada: "Rejeitada",
  em_processamento: "Em processamento",
  cancelada: "Cancelada",
};

export const STATUS_CHART_COLORS: Record<NotaFiscalStatusSefaz, string> = {
  autorizada: "var(--chart-2)",
  pendente: "var(--chart-4)",
  rejeitada: "var(--chart-1)",
  em_processamento: "var(--chart-3)",
  cancelada: "var(--chart-5)",
};

const SEFAZ_TO_DB_STATUSES: Record<NotaFiscalStatusSefaz, DbStatus[]> = {
  autorizada: ["authorized"],
  rejeitada: ["rejected", "denied", "validation_error", "processing_error"],
  cancelada: ["cancelled", "cancel_requested", "cancel_rejected", "inutilized"],
  em_processamento: ["sent_to_sefaz", "validating", "contingency"],
  pendente: ["draft", "received", "waiting_processing", "closed"],
};

export function getDbStatusesForSefaz(statusSefaz: NotaFiscalStatusSefaz): DbStatus[] {
  return SEFAZ_TO_DB_STATUSES[statusSefaz];
}

export function mapStatusSefaz(status: DbStatus): NotaFiscalStatusSefaz {
  return STATUS_TO_SEFAZ[status];
}

/** Inbound: após stub SEFAZ (sem mensageria), exibe autorizada em vez de pendente do XML sem protNFe. */
export function resolveStatusSefaz(input: {
  status: DbStatus;
  direction: NotaFiscalFluxo;
  inboundProcess?: typeof nfeInboundProcess.$inferSelect | null;
}): NotaFiscalStatusSefaz {
  const base = mapStatusSefaz(input.status);
  if (input.direction !== "inbound" || !input.inboundProcess) return base;

  const inboundStatus = input.inboundProcess.inboundStatus as NfeInboundStatus;
  if (inboundStatus === "rejected_inbound") {
    return base === "pendente" || base === "em_processamento" ? "rejeitada" : base;
  }
  if (base === "rejeitada" || base === "cancelada") return base;

  if (inboundStatusRank(inboundStatus) >= inboundStatusRank("sefaz_validated")) {
    return "autorizada";
  }

  return base;
}

export function formatCnpj(digits: string | null | undefined): string {
  const d = (digits ?? "").replace(/\D/g, "").padStart(14, "0").slice(0, 14);
  if (d.length < 14) return digits ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatDocument(digits: string | null | undefined): string {
  const d = (digits ?? "").replace(/\D/g, "");
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }
  if (d.length === 14) return formatCnpj(d);
  return digits ?? "";
}

export function padNumero(number: number): string {
  return String(number).padStart(9, "0");
}

export function parseMetadataIssuerName(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "issuerName" in metadata) {
    const name = (metadata as { issuerName?: unknown }).issuerName;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  }
  return undefined;
}

export function mapIntegracao(input: {
  status: DbStatus;
  sapDocumentId: string | null;
  sapOrderId?: string | null;
  hasSapError?: boolean;
  direction?: NotaFiscalFluxo;
  inboundProcess?: typeof nfeInboundProcess.$inferSelect | null;
}): { label: string; tipo: NotaFiscalIntegracaoTipo } {
  if (
    input.status === "processing_error" ||
    input.status === "validation_error" ||
    input.hasSapError ||
    input.inboundProcess?.inboundStatus === "inbound_error"
  ) {
    return { label: "Integração com erro", tipo: "error" };
  }
  if (input.sapDocumentId) {
    return { label: "SAP sincronizado", tipo: "sync" };
  }

  if (input.direction === "inbound" && input.inboundProcess) {
    const inboundStatus = input.inboundProcess.inboundStatus as NfeInboundStatus;
    const rank = inboundStatusRank(inboundStatus);

    if (rank >= inboundStatusRank("pedido_validating") || input.sapOrderId) {
      return { label: "Integração SAP ativa", tipo: "sync" };
    }
    if (rank >= inboundStatusRank("sefaz_validated")) {
      return { label: "SEFAZ validada (stub)", tipo: "sync" };
    }
    return { label: "Aguardando integração SAP", tipo: "pending" };
  }

  return { label: "Webhook pendente", tipo: "pending" };
}

export function resolvePedidoTimelineLabel(
  inbound: typeof nfeInboundProcess.$inferSelect,
  current: NfeInboundStatus,
  defaultLabel: string
): string {
  if (current === "pedido_validating") {
    return "Validação pedido (xPed / nItem)";
  }
  if (current !== "pedido_alert") {
    return defaultLabel;
  }

  switch (inbound.alertCode) {
    case "NO_PURCHASE_ORDER":
      return "Alerta — sem pedido SAP";
    case "PO_NOT_FOUND":
      return "Alerta — pedido não encontrado no SAP";
    case "CPI_NOT_CONFIGURED":
      return "Alerta — integração SAP indisponível";
    case "PO_SAP_ERROR":
      return "Alerta — erro consulta SAP";
    default:
      return "Alerta — pedido SAP";
  }
}

function resolveCounterparty(input: {
  direction: NotaFiscalFluxo;
  recipientName: string | null;
  recipientDocument: string | null;
  issuerCnpj: string;
  companyCnpj: string;
  companyRazaoSocial: string;
  metadata: unknown;
}): { emitenteDestinatario: string; cnpj: string } {
  if (input.direction === "outbound") {
    return {
      emitenteDestinatario: input.recipientName?.trim() || "Destinatário não informado",
      cnpj: formatCnpj(input.recipientDocument),
    };
  }

  const issuerName =
    input.issuerCnpj === input.companyCnpj
      ? input.companyRazaoSocial
      : parseMetadataIssuerName(input.metadata) ?? formatCnpj(input.issuerCnpj);

  return {
    emitenteDestinatario: issuerName,
    cnpj: formatCnpj(input.issuerCnpj),
  };
}

export type MapToNotaFiscalInput = {
  document: typeof nfeDocuments.$inferSelect;
  companyId: string;
  companyRazaoSocial: string;
  companyCnpj: string;
  organizationId: string;
  organizationName: string;
  hasXml?: boolean;
  hasSapError?: boolean;
  inboundProcess?: typeof nfeInboundProcess.$inferSelect | null;
};

export function mapToNotaFiscal(input: MapToNotaFiscalInput): NotaFiscal {
  const d = input.document;
  const fluxo = d.direction as NotaFiscalFluxo;
  const statusSefaz = resolveStatusSefaz({
    status: d.status,
    direction: fluxo,
    inboundProcess: input.inboundProcess,
  });
  const integracao = mapIntegracao({
    status: d.status,
    sapDocumentId: d.sapDocumentId,
    sapOrderId: d.sapOrderId,
    hasSapError: input.hasSapError,
    direction: fluxo,
    inboundProcess: input.inboundProcess,
  });
  const counterparty = resolveCounterparty({
    direction: fluxo,
    recipientName: d.recipientName,
    recipientDocument: d.recipientDocument,
    issuerCnpj: d.issuerCnpj,
    companyCnpj: input.companyCnpj,
    companyRazaoSocial: input.companyRazaoSocial,
    metadata: d.metadata,
  });

  const modelo = (d.model === "65" ? "65" : "55") as "55" | "65";
  const comErro =
    d.status === "processing_error" ||
    d.status === "validation_error" ||
    integracao.tipo === "error";

  const inbound = input.inboundProcess;
  const inboundStatus = inbound?.inboundStatus as NfeInboundStatus | undefined;
  const statusInterno = inboundStatus
    ? mapInboundToStatusInterno(inboundStatus)
    : undefined;

  return {
    id: d.id,
    fluxo,
    numero: padNumero(d.number),
    serie: String(d.series),
    modelo,
    emissaoAt: (d.issuedAt ?? d.createdAt).toISOString(),
    ultimaAtualizacaoAt: d.updatedAt.toISOString(),
    emitenteDestinatario: counterparty.emitenteDestinatario,
    cnpj: counterparty.cnpj,
    valorTotal: parseFloat(d.totalAmount ?? "0"),
    statusSefaz,
    integracaoLabel: integracao.label,
    integracaoTipo: integracao.tipo,
    chaveAcesso: d.accessKey ?? "",
    semXml: input.hasXml === false,
    comErro,
    organizacaoId: input.organizationId,
    organizacaoNome: input.organizationName,
    companyId: input.companyId,
    companyRazaoSocial: input.companyRazaoSocial,
    ...(inboundStatus
      ? {
          inboundStatus,
          inboundStatusLabel: INBOUND_STATUS_LABELS[inboundStatus],
          statusInterno,
          statusInternoLabel: statusInterno
            ? STATUS_INTERNO_LABELS[statusInterno]
            : undefined,
          alertaInbound:
            inboundStatus === "pedido_alert" || Boolean(inbound?.alertCode),
        }
      : {}),
  };
}

export function buildSummaryBucket(
  valor: number,
  count: number
): { valor: number; count: number } {
  return { valor: Math.round(valor * 100) / 100, count };
}

export function buildStatusDistribution(
  countsBySefaz: Partial<Record<NotaFiscalStatusSefaz, number>>
): StatusDistributionSlice[] {
  const total = Object.values(countsBySefaz).reduce((a, b) => a + (b ?? 0), 0);
  if (total === 0) return [];

  const order: NotaFiscalStatusSefaz[] = [
    "autorizada",
    "pendente",
    "em_processamento",
    "rejeitada",
    "cancelada",
  ];

  return order
    .map((status) => {
      const count = countsBySefaz[status] ?? 0;
      if (count === 0) return null;
      return {
        status,
        label: STATUS_LABELS[status],
        count,
        percentage: Math.round((count / total) * 1000) / 10,
        fill: STATUS_CHART_COLORS[status],
      };
    })
    .filter((s): s is StatusDistributionSlice => s !== null);
}

export function buildAlerts(counts: {
  rejeitadas: number;
  integracaoErro: number;
  semXml: number;
  semPedido?: number;
}): NotaFiscalAlert[] {
  const alerts: NotaFiscalAlert[] = [];
  if (counts.semPedido && counts.semPedido > 0) {
    alerts.push({
      id: "no_purchase_order",
      title: "NF sem pedido SAP",
      count: counts.semPedido,
      variant: "warning",
    });
  }
  if (counts.rejeitadas > 0) {
    alerts.push({
      id: "rejected",
      title: "documentos rejeitados",
      count: counts.rejeitadas,
      variant: "destructive",
    });
  }
  if (counts.integracaoErro > 0) {
    alerts.push({
      id: "integration_error",
      title: "integrações com erro",
      count: counts.integracaoErro,
      variant: "warning",
    });
  }
  if (counts.semXml > 0) {
    alerts.push({
      id: "missing_xml",
      title: "notas sem XML",
      count: counts.semXml,
      variant: "info",
    });
  }
  return alerts;
}

export function buildModelosUsage(
  model55: number,
  model65: number
): ModeloUsage[] {
  const total = model55 + model65;
  if (total === 0) return [];

  return [
    {
      modelo: "55",
      label: "NF-e (55)",
      percentage: Math.round((model55 / total) * 1000) / 10,
    },
    {
      modelo: "65",
      label: "NFC-e (65)",
      percentage: Math.round((model65 / total) * 1000) / 10,
    },
  ].filter((m) => m.percentage > 0);
}

export function mapTimelineToRecentEvent(input: {
  id: string;
  title: string;
  message: string | null;
  createdAt: Date;
  documentNumber: number;
  documentStatus: DbStatus;
  source: string;
}): RecentEvent {
  const message =
    input.message?.trim() ||
    (input.title.includes("Nota")
      ? input.title
      : `Nota ${padNumero(input.documentNumber)} — ${input.title}`);

  let type: RecentEvent["type"] = "info";
  const statusSefaz = mapStatusSefaz(input.documentStatus);
  const lower = `${input.title} ${input.message ?? ""}`.toLowerCase();

  if (statusSefaz === "autorizada" || lower.includes("autoriz")) {
    type = "success";
  } else if (statusSefaz === "rejeitada" || lower.includes("rejeit")) {
    type = "error";
  } else if (
    input.source === "sap" ||
    lower.includes("pendente") ||
    lower.includes("integração")
  ) {
    type = "warning";
  }

  return {
    id: input.id,
    message,
    timestamp: input.createdAt.toISOString(),
    type,
  };
}
