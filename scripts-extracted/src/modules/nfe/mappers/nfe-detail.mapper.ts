import type {
  nfeDocumentAttachments,
  nfeDocumentEvents,
  nfeDocumentTimeline,
  nfeDocuments,
  nfeInboundProcess,
  nfeSapDocuments,
} from "../../../db/nfe-schema.js";
import type { ParsedNfeParte, ParsedNfeXmlDetail } from "../parsers/nfe-xml.parser.js";
import {
  inboundStatusRank,
  TIMELINE_STEP_ORDER,
  type NfeInboundStatus,
} from "../inbound/inbound-status.js";
import {
  formatDocument,
  mapToNotaFiscal,
  parseMetadataIssuerName,
  resolvePedidoTimelineLabel,
  type MapToNotaFiscalInput,
  type NotaFiscal,
} from "./nfe-listing.mapper.js";

export type NotaFiscalParte = {
  razaoSocial: string;
  cnpj: string;
  ie: string;
  email?: string;
  endereco: string;
};

export type NotaFiscalItem = {
  item: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
  icms: number;
  status: "ok" | "verificar";
};

export type NotaFiscalTimelineStep = {
  hora: string;
  label: string;
  status: "done" | "current" | "pending";
};

export type NotaFiscalAnexo = {
  id: string;
  label: string;
  tipo: "xml" | "pdf" | "json";
};

export type NotaFiscalImposto = {
  id: string;
  tipo: string;
  baseCalculo: number;
  aliquota: number;
  valor: number;
};

export type NotaFiscalEvento = {
  id: string;
  tipo: string;
  descricao: string;
  dataHora: string;
  protocolo?: string;
};

export type NotaFiscalHistoricoEntry = {
  id: string;
  acao: string;
  usuario: string;
  dataHora: string;
  detalhe?: string;
};

export type SapReferencia = {
  tipo: string;
  docNumber: string;
  itemNumber?: string;
  fiscalYear?: string;
};

export type SapReferencias = {
  pedido: SapReferencia[];
  delivery: SapReferencia[];
  migo: SapReferencia[];
  miro: SapReferencia[];
  docnumSap: SapReferencia[];
};

export type NotaFiscalDetail = NotaFiscal & {
  valorProdutos: number;
  valorIcms: number;
  protocolo: string;
  autorizacaoAt: string;
  ambiente: "Produção" | "Homologação";
  codigoResultado: number;
  mensagemResultado: string;
  emitente: NotaFiscalParte;
  destinatario: NotaFiscalParte;
  itens: NotaFiscalItem[];
  timeline: NotaFiscalTimelineStep[];
  timelineVariant: "inbound" | "outbound";
  anexos: NotaFiscalAnexo[];
  impostos: NotaFiscalImposto[];
  eventos: NotaFiscalEvento[];
  historico: NotaFiscalHistoricoEntry[];
  sapReferencias?: SapReferencias;
  alerta?: { code: string; message: string };
};

type DbAttachment = typeof nfeDocumentAttachments.$inferSelect;
type DbEvent = typeof nfeDocumentEvents.$inferSelect;
type DbTimeline = typeof nfeDocumentTimeline.$inferSelect;
type DbDocument = typeof nfeDocuments.$inferSelect;

const XML_KINDS = new Set([
  "xml_authorized",
  "xml_distribution",
  "xml_request",
  "xml_response",
]);

const EVENT_TYPE_LABELS: Record<string, string> = {
  authorization: "Autorização",
  cancellation: "Cancelamento",
  cancellation_denied: "Cancelamento negado",
  correction_letter: "CC-e",
  manifestation_confirmation: "Manifestação — Confirmação",
  manifestation_unknown: "Manifestação — Desconhecimento",
  manifestation_not_performed: "Manifestação — Não realizada",
  manifestation_awareness: "Manifestação — Ciência",
  epec: "EPEC",
  protocol_query: "Consulta de protocolo",
  status_query: "Consulta de status",
  distribution_dfe: "Distribuição DF-e",
  xml_import: "Importação XML",
  xml_export: "Exportação XML",
  system_status_change: "Alteração de status",
  webhook_callback: "Webhook",
  sap_callback: "Integração SAP",
  manual_note: "Nota manual",
  inbound_status_change: "Status inbound",
  pedido_validation: "Validação pedido",
  sap_delivery_create: "Delivery SAP",
  sap_migo: "MIGO",
  sap_miro: "MIRO",
  inbound_rejection: "Rejeição inbound",
  portaria_confirmation: "Portaria",
};

const TIMELINE_SOURCE_USER: Record<string, string> = {
  system: "Sistema",
  sefaz: "Sistema",
  sap: "SAP",
  webhook: "Sistema",
  job: "Sistema",
  api: "Sistema",
  user: "Usuário",
};

type DbInboundProcess = typeof nfeInboundProcess.$inferSelect;
type DbSapDocument = typeof nfeSapDocuments.$inferSelect;

export type MapToNotaFiscalDetailInput = MapToNotaFiscalInput & {
  events: DbEvent[];
  timeline: DbTimeline[];
  attachments: DbAttachment[];
  parsedXml?: ParsedNfeXmlDetail | null;
  inboundProcess?: DbInboundProcess | null;
  sapDocuments?: DbSapDocument[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatTimeSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function mapParsedParte(parte: ParsedNfeParte): NotaFiscalParte {
  return {
    razaoSocial: parte.razaoSocial,
    cnpj: formatDocument(parte.document),
    ie: parte.ie,
    email: parte.email,
    endereco: parte.endereco,
  };
}

function fallbackEmitente(input: {
  document: DbDocument;
  companyRazaoSocial: string;
  companyCnpj: string;
}): NotaFiscalParte {
  const issuerName =
    input.document.issuerCnpj === input.companyCnpj
      ? input.companyRazaoSocial
      : parseMetadataIssuerName(input.document.metadata) ?? "Emitente";

  return {
    razaoSocial: issuerName,
    cnpj: formatDocument(input.document.issuerCnpj),
    ie: "ISENTO",
    endereco: "Endereço não informado",
  };
}

function fallbackDestinatario(document: DbDocument): NotaFiscalParte {
  return {
    razaoSocial: document.recipientName?.trim() || "Destinatário não informado",
    cnpj: formatDocument(document.recipientDocument),
    ie: "ISENTO",
    endereco: "Endereço não informado",
  };
}

function mapItemStatus(ncm: string, cfop: string): "ok" | "verificar" {
  if (!ncm.trim() || !cfop.trim()) return "verificar";
  return "ok";
}

function buildOutboundTimeline(
  base: NotaFiscal,
  document: DbDocument
): NotaFiscalTimelineStep[] {
  const emissao = new Date(document.issuedAt ?? document.createdAt);
  const autorizacao = new Date(document.authorizedAt ?? document.updatedAt);
  const statusSefaz = base.statusSefaz;

  const step4Label =
    statusSefaz === "autorizada"
      ? "Autorizada"
      : statusSefaz === "rejeitada"
        ? "Rejeitada"
        : statusSefaz === "cancelada"
          ? "Cancelada"
          : "Aguardando retorno";

  const step4Status: NotaFiscalTimelineStep["status"] =
    statusSefaz === "autorizada"
      ? "current"
      : statusSefaz === "em_processamento" || statusSefaz === "pendente"
        ? "pending"
        : "done";

  const sentToSefaz =
    statusSefaz === "autorizada" ||
    statusSefaz === "rejeitada" ||
    statusSefaz === "cancelada" ||
    statusSefaz === "em_processamento";

  return [
    {
      hora: formatTimeSaoPaulo(new Date(emissao.getTime() - 12 * 60 * 1000)),
      label: "Recebida pelo sistema",
      status: "done",
    },
    {
      hora: formatTimeSaoPaulo(new Date(emissao.getTime() - 4 * 60 * 1000)),
      label: "Validada com sucesso",
      status: "done",
    },
    {
      hora: formatTimeSaoPaulo(emissao),
      label: "Enviada para SEFAZ",
      status: sentToSefaz ? "done" : "current",
    },
    {
      hora: formatTimeSaoPaulo(autorizacao),
      label: step4Label,
      status: step4Status,
    },
  ];
}

function findTimelineTime(
  timeline: DbTimeline[],
  titleIncludes: string,
  fallback: Date
): Date {
  const match = timeline.find((t) =>
    t.title.toLowerCase().includes(titleIncludes.toLowerCase())
  );
  return match?.createdAt ?? fallback;
}

function buildInboundTimeline(
  inbound: DbInboundProcess,
  timeline: DbTimeline[],
  document: DbDocument
): NotaFiscalTimelineStep[] {
  const current = inbound.inboundStatus as NfeInboundStatus;
  const currentRank = inboundStatusRank(current);
  const fallback = new Date(document.createdAt);

  const timestampFor = (key: string): Date => {
    switch (key) {
      case "xml":
        return findTimelineTime(timeline, "XML importado", fallback);
      case "sefaz":
        return inbound.sefazValidatedAt ?? findTimelineTime(timeline, "SEFAZ", fallback);
      case "pedido":
        return inbound.pedidoValidatedAt ?? findTimelineTime(timeline, "pedido", fallback);
      case "delivery":
        return inbound.deliveryCreatedAt ?? findTimelineTime(timeline, "delivery", fallback);
      case "portaria":
        return inbound.portariaConfirmedAt ?? findTimelineTime(timeline, "portaria", fallback);
      case "migo":
        return inbound.migoCompletedAt ?? findTimelineTime(timeline, "MIGO", fallback);
      case "miro":
        return inbound.miroCompletedAt ?? findTimelineTime(timeline, "MIRO", fallback);
      default:
        return fallback;
    }
  };

  const pedidoLabel = resolvePedidoTimelineLabel(
    inbound,
    current,
    TIMELINE_STEP_ORDER[2]!.label
  );

  const steps = TIMELINE_STEP_ORDER.map((step, index) => {
    const minRank = inboundStatusRank(step.minStatus);
    const label = step.key === "pedido" ? pedidoLabel : step.label;

    let status: NotaFiscalTimelineStep["status"] = "pending";
    if (current === "rejected_inbound") {
      status = minRank <= inboundStatusRank("pedido_matched") ? "done" : "pending";
    } else if (current === "inbound_error") {
      status = currentRank > minRank ? "done" : currentRank === minRank ? "current" : "pending";
    } else if (currentRank > minRank) {
      status = "done";
    } else if (currentRank === minRank || (current === "pedido_alert" && step.key === "pedido")) {
      status = "current";
    } else if (index > 0 && currentRank >= minRank) {
      status = "done";
    }

    if (current === "pedido_alert" && step.key === "pedido") {
      status = "current";
    }

    return {
      hora: formatTimeSaoPaulo(timestampFor(step.key)),
      label,
      status,
    };
  });

  return steps;
}

function mapSapReferencias(docs: DbSapDocument[]): SapReferencias {
  const toRef = (d: DbSapDocument): SapReferencia => ({
    tipo: d.documentType,
    docNumber: d.docNumber,
    ...(d.itemNumber ? { itemNumber: d.itemNumber } : {}),
    ...(d.fiscalYear ? { fiscalYear: d.fiscalYear } : {}),
  });

  return {
    pedido: docs.filter((d) => d.documentType === "purchase_order").map(toRef),
    delivery: docs.filter((d) => d.documentType === "inbound_delivery").map(toRef),
    migo: docs.filter((d) => d.documentType === "goods_movement").map(toRef),
    miro: docs.filter((d) => d.documentType === "invoice_verification").map(toRef),
    docnumSap: docs.filter((d) => d.documentType === "accounting_doc").map(toRef),
  };
}

function mapEventos(events: DbEvent[]): NotaFiscalEvento[] {
  return [...events]
    .sort((a, b) => {
      const aTime = (a.completedAt ?? a.createdAt).getTime();
      const bTime = (b.completedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    })
    .map((event) => {
      const tipo = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
      const descricao =
        event.sefazStatusMessage?.trim() ||
        event.errorMessage?.trim() ||
        `${tipo} — ${event.eventStatus}`;

      const protocolo = event.protocol?.trim() || undefined;
      const dataHora = (event.completedAt ?? event.createdAt).toISOString();

      return {
        id: event.id,
        tipo,
        descricao,
        dataHora,
        ...(protocolo ? { protocolo } : {}),
      };
    });
}

function mapHistorico(timeline: DbTimeline[]): NotaFiscalHistoricoEntry[] {
  return [...timeline]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((entry) => {
      const usuario = TIMELINE_SOURCE_USER[entry.source] ?? "Sistema";
      const detalhe = entry.message?.trim() || undefined;

      return {
        id: entry.id,
        acao: entry.title,
        usuario,
        dataHora: entry.createdAt.toISOString(),
        ...(detalhe ? { detalhe } : {}),
      };
    });
}

function mapAnexos(attachments: DbAttachment[], semXml: boolean): NotaFiscalAnexo[] {
  const anexos: NotaFiscalAnexo[] = [];

  for (const att of attachments) {
    if (XML_KINDS.has(att.kind)) {
      if (semXml) continue;
      anexos.push({ id: att.id, label: "XML autorizado", tipo: "xml" });
      continue;
    }
    if (att.kind === "danfe_pdf") {
      anexos.push({ id: att.id, label: "DANFE PDF", tipo: "pdf" });
      continue;
    }
    if (att.kind === "json_payload") {
      anexos.push({ id: att.id, label: "JSON payload", tipo: "json" });
    }
  }

  return anexos;
}

function fallbackImpostos(valorProdutos: number, valorIcms: number): NotaFiscalImposto[] {
  if (valorIcms <= 0) return [];
  const aliquota =
    valorProdutos > 0 ? Math.round((valorIcms / valorProdutos) * 10000) / 100 : 0;
  return [
    {
      id: "imp-icms",
      tipo: "ICMS",
      baseCalculo: valorProdutos,
      aliquota,
      valor: valorIcms,
    },
  ];
}

function resolveTotais(
  document: DbDocument,
  parsedXml?: ParsedNfeXmlDetail | null
): { valorProdutos: number; valorIcms: number } {
  if (parsedXml) {
    return {
      valorProdutos: roundMoney(parsedXml.valorProdutos),
      valorIcms: roundMoney(parsedXml.valorIcms),
    };
  }

  const valorTotal = parseFloat(document.totalAmount ?? "0");
  return {
    valorProdutos: roundMoney(valorTotal),
    valorIcms: 0,
  };
}

function resolveSefazFields(
  document: DbDocument,
  parsedXml?: ParsedNfeXmlDetail | null,
  inboundProcess?: DbInboundProcess | null
): { codigoResultado: number; mensagemResultado: string } {
  const isInboundStubValidated =
    document.direction === "inbound" &&
    inboundProcess &&
    inboundStatusRank(inboundProcess.inboundStatus as NfeInboundStatus) >=
      inboundStatusRank("sefaz_validated") &&
    (inboundProcess.inboundStatus as NfeInboundStatus) !== "rejected_inbound";

  const codeRaw = document.sefazStatusCode ?? parsedXml?.sefazStatusCode;
  let codigoResultado = codeRaw ? Number(codeRaw) : 0;

  if (isInboundStubValidated && (!codeRaw || !Number.isFinite(codigoResultado) || codigoResultado === 0)) {
    codigoResultado = 100;
  }

  const mensagemResultado =
    document.sefazStatusMessage?.trim() ||
    parsedXml?.sefazStatusMessage?.trim() ||
    (Number.isFinite(codigoResultado) && codigoResultado === 100
      ? isInboundStubValidated && !document.sefazStatusCode && !parsedXml?.sefazStatusCode
        ? "Validação SEFAZ registrada (stub — mensageria na fase 2)."
        : "Autorizado o uso da NF-e"
      : "Aguardando processamento");

  return {
    codigoResultado: Number.isFinite(codigoResultado) ? codigoResultado : 0,
    mensagemResultado,
  };
}

export function mapToNotaFiscalDetail(input: MapToNotaFiscalDetailInput): NotaFiscalDetail {
  const d = input.document;
  const base = mapToNotaFiscal({
    ...input,
    inboundProcess: input.inboundProcess,
  });
  const { valorProdutos, valorIcms } = resolveTotais(d, input.parsedXml);
  const sefaz = resolveSefazFields(d, input.parsedXml, input.inboundProcess);

  const autorizacaoAt = (d.authorizedAt ?? d.updatedAt).toISOString();
  const protocolo = d.authorizationProtocol?.trim() ?? "";

  const emitente = input.parsedXml
    ? mapParsedParte(input.parsedXml.emitente)
    : fallbackEmitente({
        document: d,
        companyRazaoSocial: input.companyRazaoSocial,
        companyCnpj: input.companyCnpj,
      });

  const destinatario = input.parsedXml
    ? mapParsedParte(input.parsedXml.destinatario)
    : fallbackDestinatario(d);

  const itens: NotaFiscalItem[] = input.parsedXml
    ? input.parsedXml.itens.map((item) => ({
        item: item.item,
        codigo: item.codigo,
        descricao: item.descricao,
        ncm: item.ncm,
        cfop: item.cfop,
        quantidade: roundMoney(item.quantidade),
        unidade: item.unidade,
        valorUnitario: roundMoney(item.valorUnitario),
        valorTotal: roundMoney(item.valorTotal),
        icms: roundMoney(item.icms),
        status: mapItemStatus(item.ncm, item.cfop),
      }))
    : [];

  const impostos: NotaFiscalImposto[] = input.parsedXml?.impostos.length
    ? input.parsedXml.impostos.map((imp, index) => ({
        id: `imp-${imp.tipo.toLowerCase()}-${index}`,
        tipo: imp.tipo,
        baseCalculo: imp.baseCalculo,
        aliquota: imp.aliquota,
        valor: imp.valor,
      }))
    : fallbackImpostos(valorProdutos, valorIcms);

  const isInbound = d.direction === "inbound" && input.inboundProcess;
  const timelineVariant = isInbound ? "inbound" : "outbound";
  const timelineSteps = isInbound
    ? buildInboundTimeline(input.inboundProcess!, input.timeline, d)
    : buildOutboundTimeline(base, d);

  const sapReferencias =
    input.sapDocuments && input.sapDocuments.length > 0
      ? mapSapReferencias(input.sapDocuments)
      : undefined;

  const alerta =
    input.inboundProcess?.alertCode && input.inboundProcess.alertMessage
      ? {
          code: input.inboundProcess.alertCode,
          message: input.inboundProcess.alertMessage,
        }
      : undefined;

  return {
    ...base,
    valorProdutos,
    valorIcms,
    protocolo,
    autorizacaoAt,
    ambiente: d.environment === "production" ? "Produção" : "Homologação",
    codigoResultado: sefaz.codigoResultado,
    mensagemResultado: sefaz.mensagemResultado,
    emitente,
    destinatario,
    itens,
    timeline: timelineSteps,
    timelineVariant,
    anexos: mapAnexos(input.attachments, base.semXml),
    impostos,
    eventos: mapEventos(input.events),
    historico: mapHistorico(input.timeline),
    ...(sapReferencias ? { sapReferencias } : {}),
    ...(alerta ? { alerta } : {}),
  };
}

export function pickXmlContentForParsing(attachments: DbAttachment[]): string | null {
  const priority = [
    "xml_authorized",
    "xml_distribution",
    "xml_request",
    "xml_response",
  ] as const;

  for (const kind of priority) {
    const att = attachments.find((a) => a.kind === kind && a.content?.trim());
    if (att?.content) return att.content;
  }
  return null;
}
