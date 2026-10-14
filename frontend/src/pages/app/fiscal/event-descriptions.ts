import type { ApiDocumentEvent } from '@/lib/api-types';
import { formatCNPJ } from './format';
import { extractSapErrorMessage } from './inbound-labels';

// Human-readable translation for the fiscal inbound orchestrator's timeline
// (backend/internal/inbound) — see docs/architecture/17_status_and_event_catalog.md
// for the full event catalog and what metadata_json carries per event_type.

const stepTypeLabels: Record<string, string> = {
  RESOLVE_VENDOR: 'Resolução de fornecedor',
  RESOLVE_MATERIAL: 'Resolução de material',
  SEARCH_PURCHASE_ORDER: 'Busca de pedido de compra',
  CREATE_PURCHASE_ORDER: 'Pedido de compra',
  CREATE_INBOUND_DELIVERY: 'Entrega de entrada',
  POST_GOODS_RECEIPT: 'Recebimento de mercadoria (MIGO)',
  CREATE_SERVICE_ENTRY: 'Folha de entrada de serviço',
  POST_SUPPLIER_INVOICE: 'Fatura do fornecedor (MIRO)',
  POST_ACCOUNTING_DOCUMENT: 'Documento contábil'
};

const matchingStepLabels: Record<string, string> = {
  vendor: 'fornecedor',
  purchase_order: 'pedido de compra',
  material: 'material',
  quantity_price: 'quantidade/preço'
};

function stepLabel(stepType: unknown): string {
  if (typeof stepType !== 'string') return 'Etapa';
  return stepTypeLabels[stepType] ?? stepType;
}

function asMetadata(event: ApiDocumentEvent): Record<string, unknown> {
  return event.metadata_json && typeof event.metadata_json === 'object'
    ? (event.metadata_json as Record<string, unknown>)
    : {};
}

function humanizeEventType(eventType: string): string {
  const last = eventType.split('.').slice(0, -1).join(' ') || eventType;
  return last
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function metaText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function motivoAlreadyHasCode(motivo: string, cstat: string): boolean {
  const trimmed = motivo.trim();
  return (
    trimmed === cstat ||
    trimmed.startsWith(`${cstat} —`) ||
    trimmed.startsWith(`${cstat} - `) ||
    trimmed.startsWith(`${cstat}:`)
  );
}

/** SEFAZ/SEFIN cStat is a short numeric code. Gateway errors (certificate_not_found) are not. */
function isSefazCstat(value: string): boolean {
  return /^\d{3,4}$/.test(value.trim());
}

/** SEFAZ/SEFIN rejection payload uses cstat + x_motivo (not inbound's `reason`). */
export function describeAuthorityResult(meta: Record<string, unknown>): string | undefined {
  const cstat = metaText(meta.cstat) ?? metaText(meta.error_code) ?? metaText(meta.authorization_code);
  const motivo =
    metaText(meta.x_motivo) ??
    metaText(meta.reason) ??
    metaText(meta.error_message) ??
    metaText(meta.authorization_message);
  if (cstat && motivo) {
    if (!isSefazCstat(cstat) || motivoAlreadyHasCode(motivo, cstat)) return motivo;
    return `${cstat} — ${motivo}`;
  }
  if (motivo) return motivo;
  if (cstat) return isSefazCstat(cstat) ? `Código ${cstat}` : cstat;
  return undefined;
}

export function formatAuthorityReturn(code?: string | null, message?: string | null): string {
  const cstat = code?.trim() ?? '';
  const motivo = message?.trim() ?? '';
  if (cstat && motivo && isSefazCstat(cstat)) return `${cstat} — ${motivo}`;
  return motivo || cstat || '—';
}

export interface DescribedEvent {
  title: string;
  description?: string;
}

export function describeInboundEvent(event: ApiDocumentEvent): DescribedEvent {
  const meta = asMetadata(event);

  switch (event.event_type) {
    case 'fiscal.document.received.v1':
      return { title: 'Documento recebido', description: 'Nota fiscal recebida pela plataforma.' };

    case 'fiscal.document.submitted.v1':
      return {
        title: 'Enviado para autorização',
        description: 'Documento encaminhado à autoridade fiscal (SEFAZ/Prefeitura).'
      };

    case 'fiscal.document.authorized.v1': {
      const bits = [describeAuthorityResult(meta)];
      if (typeof meta.protocol === 'string' && meta.protocol) bits.push(`Protocolo ${meta.protocol}`);
      if (typeof meta.access_key === 'string' && meta.access_key) bits.push(`Chave ${meta.access_key}`);
      return {
        title: 'Documento autorizado',
        description: bits.filter(Boolean).join(' · ') || undefined
      };
    }

    case 'fiscal.document.cancel_requested.v1': {
      const bits: string[] = [];
      const justificativa = metaText(meta.justificativa) ?? metaText(meta.x_motivo);
      const cMotivo = metaText(meta.c_motivo);
      if (cMotivo) bits.push(`Motivo ${cMotivo}`);
      if (justificativa) bits.push(justificativa);
      return {
        title: 'Cancelamento solicitado',
        description: bits.join(' · ') || undefined
      };
    }

    case 'fiscal.document.cce_requested.v1': {
      const bits: string[] = [];
      const correcao = metaText(meta.correcao);
      const nSeq = metaText(meta.n_seq_evento);
      if (nSeq) bits.push(`Seq. ${nSeq}`);
      if (correcao) bits.push(correcao);
      return {
        title: 'Carta de correção solicitada',
        description: bits.join(' · ') || undefined
      };
    }

    case 'fiscal.document.correction_registered.v1': {
      const bits = [describeAuthorityResult(meta)];
      if (typeof meta.protocol === 'string' && meta.protocol) bits.push(`Protocolo ${meta.protocol}`);
      return {
        title: 'Carta de correção registrada',
        description: bits.filter(Boolean).join(' · ') || undefined
      };
    }

    case 'fiscal.document.inutilization_requested.v1': {
      const bits: string[] = [];
      const serie = metaText(meta.serie);
      const ini = metaText(meta.numero_inicial);
      const fim = metaText(meta.numero_final);
      if (serie) bits.push(`Série ${serie}`);
      if (ini && fim) bits.push(`Números ${ini}–${fim}`);
      return {
        title: 'Inutilização solicitada',
        description: bits.join(' · ') || undefined
      };
    }

    case 'fiscal.document.protocol_requested.v1':
      return {
        title: 'Protocolo solicitado',
        description: 'Consulta do protocolo de autorização enviada à SEFAZ.'
      };

    case 'fiscal.document.danfe_uploaded.v1':
      return {
        title: 'DANFE recebida',
        description: 'PDF da DANFE gerado no SAP e anexado à nota.'
      };

    case 'fiscal.document.protocol_result.v1': {
      const bits = [describeAuthorityResult(meta)];
      if (typeof meta.protocol === 'string' && meta.protocol) bits.push(`Protocolo ${meta.protocol}`);
      return {
        title: 'Protocolo consultado',
        description: bits.filter(Boolean).join(' · ') || undefined
      };
    }

    case 'manifestacao': {
      const type = metaText(meta.manifestation_type);
      const titleByType: Record<string, string> = {
        confirmacao_da_operacao: 'Destinatário confirmou a operação',
        ciencia_da_operacao: 'Destinatário registrou ciência',
        desconhecimento_da_operacao: 'Destinatário desconheceu a operação',
        operacao_nao_realizada: 'Destinatário recusou a operação'
      };
      const bits: string[] = [];
      if (typeof meta.protocol === 'string' && meta.protocol) bits.push(`Protocolo ${meta.protocol}`);
      if (typeof meta.justification === 'string' && meta.justification) bits.push(meta.justification);
      return {
        title: (type && titleByType[type]) || 'Manifestação do destinatário',
        description: bits.join(' · ') || undefined
      };
    }

    case 'fiscal.document.event_received.v1':
      return {
        title: 'Evento DistDFe recebido',
        description:
          describeAuthorityResult(meta) ??
          (typeof meta.tp_evento === 'string' ? `tpEvento ${meta.tp_evento}` : undefined)
      };

    case 'fiscal.document.cancelled.v1': {
      const bits = [describeAuthorityResult(meta)];
      if (typeof meta.protocol === 'string' && meta.protocol) bits.push(`Protocolo ${meta.protocol}`);
      return {
        title: 'Cancelada',
        description: bits.filter(Boolean).join(' · ') || undefined
      };
    }

    case 'fiscal.document.status_changed.v1': {
      const kind = metaText(meta.event_kind);
      const outcome = metaText(meta.outcome);
      const result = describeAuthorityResult(meta);
      if (kind === 'cancel' && outcome !== 'accepted') {
        return {
          title: outcome === 'error' ? 'Falha ao enviar cancelamento' : 'Cancelamento rejeitado',
          description: result ? `${result} · A nota continua autorizada.` : 'A nota continua autorizada.'
        };
      }
      if (kind === 'cce' && outcome !== 'accepted') {
        return {
          title: outcome === 'error' ? 'Falha ao enviar carta de correção' : 'Carta de correção rejeitada',
          description: result
        };
      }
      return { title: 'Status atualizado', description: result };
    }

    case 'fiscal.document.rejected.v1':
      return {
        title: 'Documento rejeitado pela autoridade',
        description: describeAuthorityResult(meta) ?? 'A autoridade fiscal recusou o XML enviado.'
      };

    case 'fiscal.document.failed.v1':
      if (metaText(meta.error_code) === 'certificate_not_found' || metaText(meta.cstat) === 'certificate_not_found') {
        return {
          title: 'Certificado digital ausente',
          description:
            describeAuthorityResult(meta) ??
            'A empresa não tem certificado A1 ativo. Cadastre o certificado em Configurações → Empresas para transmitir a nota.'
        };
      }
      if (metaText(meta.error_code) === 'certificate_expired' || metaText(meta.cstat) === 'certificate_expired') {
        return {
          title: 'Certificado digital vencido',
          description:
            describeAuthorityResult(meta) ??
            'O certificado A1 da empresa está vencido ou ainda não é válido. Envie um certificado válido em Configurações → Empresas.'
        };
      }
      if (metaText(meta.error_code) === 'processing_cancelled' || metaText(meta.cstat) === 'processing_cancelled') {
        return {
          title: 'Processamento cancelado',
          description:
            describeAuthorityResult(meta) ??
            'Um administrador interrompeu o processamento antes do envio à autoridade fiscal.'
        };
      }
      return {
        title: 'Falha na transmissão',
        description: describeAuthorityResult(meta) ?? 'Erro ao transmitir o documento.'
      };

    case 'fiscal.document.retry_scheduled.v1':
      if (metaText(meta.reason) === 'calculator_timeout') {
        return {
          title: 'Calculadora indisponível',
          description:
            metaText(meta.x_motivo) ||
            metaText(meta.error_message) ||
            'A calculadora do IBS/CBS não respondeu a tempo. A nota volta para a fila em alguns minutos.'
        };
      }
      if (metaText(meta.reason) === 'stale_processing') {
        return {
          title: 'Processamento retomado',
          description: 'A nota ficou parada por mais de 10 minutos e voltou para a fila de envio.'
        };
      }
      return {
        title: 'Reenvio enfileirado',
        description: 'A nota será transmitida novamente à autoridade fiscal.'
      };

    case 'fiscal.document.resubmitted.v1': {
      const previous = [metaText(meta.previous_cstat), metaText(meta.previous_xmotivo)].filter(Boolean).join(' - ');
      return {
        title: 'Reenviada pelo SAP (payload atualizado)',
        description: previous
          ? `A nota foi recebida novamente e voltou para a fila de envio. Retorno anterior: ${previous}.`
          : 'A nota foi recebida novamente e voltou para a fila de envio com o novo payload.'
      };
    }

    case 'fiscal.inbound.scenario_not_found.v1': {
      const bits: string[] = [];
      if (typeof meta.document_model === 'string' && meta.document_model) bits.push(`modelo ${meta.document_model}`);
      if (typeof meta.cfop === 'string' && meta.cfop) bits.push(`CFOP ${meta.cfop}`);
      if (typeof meta.vendor_cnpj === 'string' && meta.vendor_cnpj) {
        bits.push(`fornecedor ${formatCNPJ(meta.vendor_cnpj)}`);
      }
      const criteria = bits.length ? ` Critérios desta nota: ${bits.join(', ')}.` : '';
      return {
        title: 'Nenhum cenário de integração encontrado',
        description:
          `Nenhuma chamada ao SAP foi feita — não há fluxo ativo para esta empresa (ou o fluxo existente não casa com modelo/CFOP/fornecedor).${criteria} Um fluxo sem filtros extras vale para todas as notas da empresa.`
      };
    }

    case 'fiscal.inbound.sap_unavailable.v1':
      return {
        title: 'SAP indisponível',
        description: `Falha ao consultar o SAP durante a resolução de ${
          matchingStepLabels[String(meta.step)] ?? 'dados'
        }. O documento aguarda nova tentativa.`
      };

    case 'fiscal.inbound.action_required.v1':
      return {
        title: 'Ação manual necessária',
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    case 'fiscal.inbound.rejected.v1':
      return {
        title: 'Documento rejeitado',
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    case 'fiscal.inbound.reset.v1':
      return {
        title: 'Nota resetada',
        description:
          typeof meta.reason === 'string'
            ? meta.reason
            : 'Status voltou para importado. A integração será reiniciada a partir do pedido.'
      };

    case 'fiscal.inbound.pipeline_failed.v1':
      return {
        title: 'Falha no processamento da nota',
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    case 'fiscal.inbound.plan_built.v1': {
      const stepCount = typeof meta.step_count === 'number' ? meta.step_count : undefined;
      const template = typeof meta.template_code === 'string' ? meta.template_code : undefined;
      return {
        title: 'Plano de execução criado',
        description: [
          template ? `Modelo de processo: ${template}` : null,
          stepCount !== undefined ? `${stepCount} etapa(s) no SAP` : null
        ]
          .filter(Boolean)
          .join(' · ')
      };
    }

    case 'fiscal.inbound.completed.v1':
      return { title: 'Integração concluída', description: 'Todas as etapas do plano foram finalizadas.' };

    case 'fiscal.inbound.step_completed.v1': {
      const sapDoc = typeof meta.sap_document_number === 'string' ? meta.sap_document_number : '';
      const mode = meta.mode === 'AUTO' ? 'automaticamente' : 'manualmente';
      return {
        title: `${stepLabel(meta.step_type)} concluído`,
        description: sapDoc
          ? `Documento SAP nº ${sapDoc}, lançado ${mode}.`
          : `Executado ${mode}, sem número de documento retornado.`
      };
    }

    case 'fiscal.inbound.step_failed.v1':
      return {
        title: `${stepLabel(meta.step_type)} falhou`,
        description:
          typeof meta.error_message === 'string'
            ? extractSapErrorMessage(meta.error_message)
            : String(meta.error_code ?? '')
      };

    case 'fiscal.inbound.step_skipped.v1':
      return {
        title: `${stepLabel(meta.step_type)} pulado`,
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    default: {
      const fromMeta = describeAuthorityResult(meta);
      return { title: humanizeEventType(event.event_type), description: fromMeta };
    }
  }
}
