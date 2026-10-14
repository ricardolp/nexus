import type { ApiDocumentEvent, ApiFiscalDocument, ApiPlanStep } from '@/lib/api-types';
import { PROCESS_TEMPLATES } from '../settings/integrations/flows/templates';
import { describeAuthorityResult } from './event-descriptions';
import { extractSapErrorMessage, stepTypeLabels } from './inbound-labels';

export type HopActor = 'sap' | 'nexus' | 'sefaz' | 'prefeitura' | 'upload';
export type HopStatus = 'done' | 'current' | 'pending' | 'failed';
export type HopAlertTone = 'progress' | 'success' | 'warning' | 'danger';

export interface DocumentHop {
  id: string;
  actor: HopActor;
  /** Short name under the node: SAP, Nexus, SEFAZ… */
  actorLabel: string;
  /** Pill / highlighted verb for this hop. */
  label: string;
  status: HopStatus;
  occurredAt?: string | null;
}

export interface DocumentHopAlert {
  tone: HopAlertTone;
  title: string;
  description?: string;
}

export interface DocumentHopTrack {
  hops: DocumentHop[];
  processLabel: string;
  alert: DocumentHopAlert | null;
}

export interface HopTrackInput {
  document: ApiFiscalDocument;
  events?: ApiDocumentEvent[];
  currentPlanStep?: Pick<ApiPlanStep, 'step_type' | 'status' | 'error_message_sanitized'> | null;
  templateCode?: string | null;
  scenarioMissing?: boolean;
}

const ACTOR_LABEL: Record<HopActor, string> = {
  sap: 'SAP',
  nexus: 'Nexus',
  sefaz: 'SEFAZ',
  prefeitura: 'Prefeitura',
  upload: 'Upload'
};

const INBOUND_NEXUS = new Set([
  'received',
  'xml_validated',
  'classified',
  'matching',
  'validating',
  'action_required'
]);

const INBOUND_SAP = new Set([
  'ready_for_posting',
  'executing',
  'po_created',
  'delivery_created',
  'gr_posted',
  'invoice_posted'
]);

const SAP_STEP_CURRENT = new Set(['READY', 'RUNNING', 'AWAITING_MANUAL', 'ACTION_REQUIRED']);
const SAP_STEP_FAILED = new Set(['FAILED', 'BLOCKED']);

function norm(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function isNfse(document: ApiFiscalDocument) {
  return norm(document.document_type) === 'nfse';
}

function isOutbound(document: ApiFiscalDocument) {
  return norm(document.direction) === 'outbound';
}

function isErpSource(sourceSystem: string) {
  const source = norm(sourceSystem);
  if (!source) return false;
  if (source === 'manual_upload' || source === 'nexus_ui') return false;
  if (source === 'nfe_gateway_distribution' || source.startsWith('nfe_gateway')) return false;
  return true;
}

function isSefazIngest(sourceSystem: string) {
  const source = norm(sourceSystem);
  return !source || source === 'nfe_gateway_distribution' || source.startsWith('nfe_gateway');
}

function authorityActor(document: ApiFiscalDocument): HopActor {
  return isNfse(document) ? 'prefeitura' : 'sefaz';
}

function eventAt(events: ApiDocumentEvent[] | undefined, types: string[]) {
  if (!events?.length) return undefined;
  const wanted = new Set(types);
  for (let i = events.length - 1; i >= 0; i--) {
    if (wanted.has(events[i].event_type)) return events[i].occurred_at;
  }
  return undefined;
}

function hop(
  id: string,
  actor: HopActor,
  label: string,
  status: HopStatus,
  occurredAt?: string | null
): DocumentHop {
  return { id, actor, actorLabel: ACTOR_LABEL[actor], label, status, occurredAt };
}

function processLabel(document: ApiFiscalDocument, templateCode?: string | null) {
  const template = templateCode
    ? PROCESS_TEMPLATES.find((item) => item.code === templateCode)
    : undefined;
  if (template) return template.label;
  const kind = isNfse(document) ? 'NFS-e' : 'NF-e';
  return isOutbound(document) ? `${kind} saída` : `${kind} entrada`;
}

function sapStepLabel(step?: HopTrackInput['currentPlanStep'], fallback = 'Lançamento') {
  if (!step) return fallback;
  return stepTypeLabels[step.step_type] ?? step.step_type;
}

const CERTIFICATE_MISSING_FALLBACK =
  'A empresa não tem certificado A1 ativo. Cadastre o certificado em Configurações → Empresas para transmitir a nota.';
const CERTIFICATE_EXPIRED_FALLBACK =
  'O certificado A1 da empresa está vencido ou ainda não é válido. Envie um certificado válido em Configurações → Empresas.';

function hasProcessingCancelled(events: ApiDocumentEvent[] | undefined) {
  return (events ?? []).some((event) => {
    const meta = event.metadata_json;
    if (!meta || typeof meta !== 'object') return false;
    const code = (meta as Record<string, unknown>).error_code;
    return typeof code === 'string' && norm(code) === 'processing_cancelled';
  });
}

function certificateProblemCode(document: ApiFiscalDocument, events: ApiDocumentEvent[] | undefined) {
  const fromDocument = norm(document.authorization_code);
  if (fromDocument === 'certificate_not_found' || fromDocument === 'certificate_expired') return fromDocument;
  for (const event of events ?? []) {
    const meta = event.metadata_json;
    if (!meta || typeof meta !== 'object') continue;
    const raw = (meta as Record<string, unknown>).error_code ?? (meta as Record<string, unknown>).cstat;
    const code = typeof raw === 'string' ? norm(raw) : '';
    if (code === 'certificate_not_found' || code === 'certificate_expired') return code;
  }
  return '';
}

function latestReason(document: ApiFiscalDocument, events: ApiDocumentEvent[] | undefined) {
  if (events?.length) {
    const preferred = [
      'fiscal.document.rejected.v1',
      'fiscal.document.failed.v1',
      'fiscal.document.authorized.v1',
      'fiscal.document.cancelled.v1'
    ];
    const preferredSet = new Set(preferred);
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!preferredSet.has(event.event_type)) continue;
      if (!event.metadata_json || typeof event.metadata_json !== 'object') continue;
      const described = describeAuthorityResult(event.metadata_json as Record<string, unknown>);
      if (described) return described;
    }
    const tail = events[events.length - 1]?.metadata_json;
    if (tail && typeof tail === 'object') {
      const described = describeAuthorityResult(tail as Record<string, unknown>);
      if (described) return described;
    }
  }
  return describeAuthorityResult({
    cstat: document.authorization_code,
    x_motivo: document.authorization_message
  });
}

function buildOutbound(input: HopTrackInput): DocumentHop[] {
  const { document, events } = input;
  const status = norm(document.status);
  const processing = norm(document.processing_status);
  const authority = authorityActor(document);
  const withErp = isErpSource(document.source_system);
  const authorized = status === 'authorized';
  const cancelled = status === 'cancelled';
  const rejected = status === 'rejected' || status === 'denied' || status === 'failed';
  const hasResult = authorized || cancelled || rejected;
  const atSefaz =
    !hasResult &&
    (status === 'submitted' ||
      status === 'cancel_requested' ||
      processing === 'waiting_external' ||
      processing === 'waiting_recibo' ||
      processing === 'retry_scheduled');
  const nexusFailed = !hasResult && !atSefaz && processing === 'failed';
  const sefazFailed = rejected || (atSefaz && processing === 'failed');
  const protocolDone = hasResult;
  const returnDone = hasResult && (processing === 'completed' || processing === 'failed' || authorized || cancelled || rejected);
  const certificateCode = certificateProblemCode(document, events);
  const certificateMissing = certificateCode === 'certificate_not_found' || certificateCode === 'certificate_expired';

  const receivedAt = eventAt(events, ['fiscal.document.received.v1']) ?? document.received_at;
  const submittedAt = eventAt(events, ['fiscal.document.submitted.v1', 'fiscal.document.queued.v1']);
  const resultAt =
    eventAt(events, [
      'fiscal.document.authorized.v1',
      'fiscal.document.rejected.v1',
      'fiscal.document.failed.v1',
      'fiscal.document.cancelled.v1'
    ]) ?? document.completed_at;

  const cancelMeta = (events ?? []).find((e) => e.event_type === 'fiscal.document.cancelled.v1')?.metadata_json;
  const cancelProtocol =
    cancelMeta && typeof cancelMeta === 'object' && typeof (cancelMeta as Record<string, unknown>).protocol === 'string'
      ? String((cancelMeta as Record<string, unknown>).protocol)
      : '';

  const hops: DocumentHop[] = [];
  if (withErp) {
    hops.push(hop('origin-in', 'sap', 'Enviado', 'done', receivedAt));
  }

  hops.push(
    hop(
      'nexus-in',
      'nexus',
      atSefaz || hasResult ? 'Recebido' : processing === 'queued' ? 'Na fila' : 'Validando',
      hasResult || atSefaz ? 'done' : nexusFailed ? 'failed' : 'current',
      hasResult || atSefaz ? (submittedAt ?? receivedAt) : undefined
    )
  );

  hops.push(
    hop(
      'authority',
      authority,
      certificateMissing
        ? certificateCode === 'certificate_expired'
          ? 'Certificado vencido'
          : 'Sem certificado'
        : cancelled
          ? 'Cancelada'
          : authorized
            ? 'Autorizada'
            : sefazFailed
              ? status === 'rejected'
                ? 'Rejeitada'
                : 'Falhou'
            : atSefaz
              ? status === 'cancel_requested'
                ? 'Cancelando'
                : 'Autorizando'
              : 'Autorização',
      authorized || cancelled ? 'done' : sefazFailed ? 'failed' : atSefaz ? 'current' : 'pending',
      hasResult || atSefaz ? (resultAt ?? submittedAt) : undefined
    )
  );

  hops.push(
    hop(
      'nexus-out',
      'nexus',
      protocolDone
        ? certificateMissing
          ? 'Falha gravada'
          : cancelled
            ? cancelProtocol
              ? `Cancelamento · Protocolo ${cancelProtocol}`
              : 'Cancelamento gravado'
            : rejected
              ? 'Rejeição gravada'
              : 'Protocolo gravado'
        : 'Protocolo',
      protocolDone ? 'done' : hasResult ? 'current' : 'pending',
      protocolDone ? resultAt : undefined
    )
  );

  if (withErp) {
    hops.push(
      hop(
        'origin-out',
        'sap',
        returnDone ? 'Retorno entregue' : 'Retorno',
        returnDone ? 'done' : protocolDone ? 'current' : 'pending',
        returnDone ? (document.completed_at ?? resultAt) : undefined
      )
    );
  }

  return hops;
}

function buildInbound(input: HopTrackInput): DocumentHop[] {
  const { document, events, currentPlanStep, scenarioMissing } = input;
  const status = norm(document.status);
  const processing = norm(document.processing_status);
  const sapStepFailed = currentPlanStep ? SAP_STEP_FAILED.has(currentPlanStep.status) : false;
  const sapStepCurrent = currentPlanStep ? SAP_STEP_CURRENT.has(currentPlanStep.status) : false;
  const completed = status === 'completed';
  const inNexus = INBOUND_NEXUS.has(status);
  const inSap = INBOUND_SAP.has(status) || sapStepCurrent || sapStepFailed;
  const terminalFail = status === 'blocked' || status === 'rejected' || status === 'failed';
  const sapFailed = terminalFail && (inSap || sapStepFailed);
  const nexusFailed = terminalFail && !inSap && !completed && !scenarioMissing;
  const nexusDone = completed || inSap || sapFailed;
  const sapDone = completed;
  const sapCurrent = !sapDone && (inSap || sapStepCurrent) && !sapFailed;
  const nexusCurrent = (inNexus || scenarioMissing) && !nexusDone && !nexusFailed;

  const receivedAt = eventAt(events, ['fiscal.document.received.v1']) ?? document.received_at;
  const planAt = eventAt(events, ['fiscal.inbound.plan_built.v1']);
  const sapAt =
    eventAt(events, ['fiscal.inbound.completed.v1', 'fiscal.inbound.step_completed.v1']) ??
    document.completed_at;

  const hops: DocumentHop[] = [];
  if (isSefazIngest(document.source_system) || isNfse(document)) {
    hops.push(hop('origin-in', authorityActor(document), 'XML recebido', 'done', receivedAt));
  } else if (norm(document.source_system) === 'manual_upload') {
    hops.push(hop('origin-in', 'upload', 'XML enviado', 'done', receivedAt));
  } else if (isErpSource(document.source_system)) {
    hops.push(hop('origin-in', 'sap', 'Recebido', 'done', receivedAt));
  }

  hops.push(
    hop(
      'nexus',
      'nexus',
      nexusFailed
        ? status === 'rejected'
          ? 'Rejeitado'
          : 'Bloqueado'
        : nexusDone
          ? 'Processado'
          : scenarioMissing
            ? 'Sem cenário'
            : status === 'action_required'
              ? 'Ação necessária'
              : processing === 'queued'
                ? 'Na fila'
                : 'Matching',
      nexusFailed ? 'failed' : nexusDone ? 'done' : nexusCurrent ? 'current' : 'pending',
      nexusDone ? (planAt ?? receivedAt) : undefined
    )
  );

  hops.push(
    hop(
      'sap',
      'sap',
      sapFailed
        ? sapStepLabel(currentPlanStep, 'Falhou no SAP')
        : sapDone
          ? 'Lançado'
          : sapCurrent
            ? sapStepLabel(currentPlanStep, 'Lançando')
            : 'Lançamento',
      sapFailed ? 'failed' : sapDone ? 'done' : sapCurrent ? 'current' : 'pending',
      sapDone ? sapAt : sapCurrent ? planAt : undefined
    )
  );

  return hops;
}

function buildAlert(input: HopTrackInput, hops: DocumentHop[]): DocumentHopAlert | null {
  const { document, events, currentPlanStep, scenarioMissing } = input;
  const current = hops.find((item) => item.status === 'current');
  const failed = hops.find((item) => item.status === 'failed');
  const allDone = hops.length > 0 && hops.every((item) => item.status === 'done');
  const authorityName = isNfse(document) ? 'Prefeitura' : 'SEFAZ';
  const reason = latestReason(document, events);

  if (scenarioMissing) {
    return {
      tone: 'warning',
      title: 'Nenhum cenário de integração para esta nota',
      description:
        'O Nexus recebeu o XML, mas não há fluxo ativo que case com esta empresa. Configure um em Fluxos de processo.'
    };
  }

  if (failed) {
    const certificateCode = certificateProblemCode(document, events);
    if (certificateCode === 'certificate_not_found' || certificateCode === 'certificate_expired') {
      return {
        tone: 'danger',
        title: certificateCode === 'certificate_expired' ? 'Certificado digital vencido' : 'Certificado digital ausente',
        description:
          reason ??
          (certificateCode === 'certificate_expired' ? CERTIFICATE_EXPIRED_FALLBACK : CERTIFICATE_MISSING_FALLBACK)
      };
    }
    if (norm(document.authorization_code) === 'processing_cancelled' || hasProcessingCancelled(events)) {
      return {
        tone: 'danger',
        title: 'Processamento cancelado',
        description: reason ?? 'Um administrador interrompeu o processamento antes do envio à autoridade fiscal.'
      };
    }
    if (failed.id === 'authority') {
      return {
        tone: 'danger',
        title: `${authorityName} recusou a nota`,
        description: reason ?? 'O retorno ao sistema de origem segue mesmo assim.'
      };
    }
    if (failed.actor === 'sap') {
      return {
        tone: 'danger',
        title: `${sapStepLabel(currentPlanStep, 'Lançamento SAP')} falhou`,
        description:
          extractSapErrorMessage(currentPlanStep?.error_message_sanitized) ||
          reason ||
          'Abra a aba Integração para corrigir e seguir.'
      };
    }
    return {
      tone: 'danger',
      title: failed.label,
      description: reason ?? 'Veja a linha do tempo para o detalhe desta falha.'
    };
  }

  if (allDone) {
    const authorized = norm(document.status) === 'authorized';
    if (isOutbound(input.document) && authorized) {
      return {
        tone: 'success',
        title: isNfse(document)
          ? 'Tudo certo — a Prefeitura autorizou esta NFS-e'
          : 'Tudo certo — a SEFAZ autorizou esta NF-e',
        description: isNfse(document)
          ? 'O protocolo já está gravado. A nota pode ser consultada, baixada ou enviada ao tomador.'
          : 'O protocolo já está gravado. A nota pode ser consultada ou baixada.'
      };
    }
    return {
      tone: 'success',
      title: isOutbound(input.document) ? 'Nota concluída neste fluxo' : 'Integração concluída',
      description: isOutbound(input.document)
        ? 'O protocolo foi registrado nesta nota.'
        : 'Todas as etapas do plano foram finalizadas.'
    };
  }

  if (!current) return null;

  if (current.id === 'nexus-in' || (current.id === 'nexus' && norm(document.status) !== 'action_required')) {
    return {
      tone: 'progress',
      title: isOutbound(document) ? 'Preparando transmissão' : 'Processando em segundo plano',
      description: isOutbound(document)
        ? `Validando o documento antes de enviar à ${authorityName}.`
        : 'A nota já foi recebida. Extração de itens, impostos e matching com o SAP continuam sem travar a tela — esta página atualiza sozinha.'
    };
  }

  if (current.id === 'authority') {
    return {
      tone: 'progress',
      title: `Aguardando autorização da ${authorityName}`,
      description:
        norm(document.processing_status) === 'retry_scheduled'
          ? 'Nova tentativa já agendada. A tela atualiza sozinha.'
          : norm(document.processing_status) === 'waiting_recibo'
            ? `O XML já foi transmitido. A resposta da ${authorityName} pode levar alguns instantes. Se passar de 10 minutos, o envio é tentado de novo.`
            : `A nota ainda está na fila de autorização. Se passar de 10 minutos sem retorno, o envio é tentado de novo automaticamente.`
    };
  }

  if (current.id === 'nexus-out') {
    return {
      tone: 'progress',
      title: 'Gravando o retorno da autorização',
      description: 'O protocolo chegou e está sendo persistido nesta nota.'
    };
  }

  if (current.id === 'origin-out') {
    return {
      tone: 'progress',
      title: 'Enviando retorno ao SAP',
      description: 'O webhook com o resultado da nota está a caminho do sistema de origem.'
    };
  }

  if (current.actor === 'sap') {
    return {
      tone: currentPlanStep?.status === 'AWAITING_MANUAL' || currentPlanStep?.status === 'ACTION_REQUIRED' ? 'warning' : 'progress',
      title: `Etapa atual: ${sapStepLabel(currentPlanStep, 'Lançamento SAP')}`,
      description: 'O detalhe de cada transação (pedido, MIGO, MIRO) continua na aba Integração.'
    };
  }

  if (norm(document.status) === 'action_required') {
    return {
      tone: 'warning',
      title: 'Ação necessária no matching',
      description: reason ?? 'Há item, fornecedor ou pedido que precisa de correção antes do lançamento no SAP.'
    };
  }

  return { tone: 'progress', title: current.label };
}

export function buildDocumentHopTrack(input: HopTrackInput): DocumentHopTrack {
  const hops = isOutbound(input.document) ? buildOutbound(input) : buildInbound(input);
  return {
    hops,
    processLabel: processLabel(input.document, input.templateCode),
    alert: buildAlert(input, hops)
  };
}
