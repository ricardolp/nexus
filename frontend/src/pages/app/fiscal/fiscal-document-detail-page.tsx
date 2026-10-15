import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BanIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  FilePenLineIcon,
  HashIcon,
  RefreshCwIcon,
  ReplaceIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  Trash2Icon
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiDocumentEvent } from '@/lib/api-types';
import {
  abortOutboundProcessing,
  cancelOutboundNFe,
  cancelOutboundNFSe,
  deleteFiscalDocument,
  downloadFiscalDocument,
  getFiscalDocument,
  getOrchestration,
  listCompanies,
  listDocumentEvents,
  listMemberRoles,
  listMembers,
  reprocessInboundDocument,
  requestNFeInutilization,
  requestOutboundCCe,
  requestOutboundProtocol,
  resetInboundDocument,
  resubmitOutboundDocument
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AbortProcessingDialog } from './abort-processing-dialog';
import { CancelNFeDialog } from './cancel-nfe-dialog';
import { CancelNFSeDialog } from './cancel-nfse-dialog';
import { CCeDialog } from './cce-dialog';
import { DeleteDocumentDialog } from './delete-document-dialog';
import { DocumentIntegrationPanel } from './document-integration-panel';
import { DocumentStageTracker } from './document-stage-tracker';
import {
  canAbortOutboundProcessing,
  canResetInboundDocument,
  finalityLabel,
  formatCurrency,
  formatDateTime,
  isDocumentInFlight,
  isInboundProcessing,
  operationTypeLabel,
  sourceSystemLabel
} from './format';
import { InutilizationDialog } from './inutilization-dialog';
import { NFePartyCard } from './nfe-party-card';
import { TotalsTaxChips } from './nfe-tax-chips';
import { ResetDocumentDialog } from './reset-document-dialog';
import { badgeFor, processingStatusLabels, statusLabels } from './status-labels';
import { SubstituteNFSeDialog } from './substitute-nfse-dialog';

function hasPayload(document: { payloads?: Array<{ payload_type: string }> | null }, type: string) {
  return (document.payloads ?? []).some((p) => p.payload_type === type);
}

function latestRecipientManifestation(events: ApiDocumentEvent[]): string | null {
  const labels: Record<string, string> = {
    confirmacao_da_operacao: 'Destinatário confirmou',
    ciencia_da_operacao: 'Destinatário com ciência',
    desconhecimento_da_operacao: 'Destinatário desconheceu',
    operacao_nao_realizada: 'Destinatário recusou'
  };
  for (const event of events) {
    if (event.event_type !== 'manifestacao') continue;
    const meta = event.metadata_json && typeof event.metadata_json === 'object'
      ? (event.metadata_json as Record<string, unknown>)
      : {};
    const type = typeof meta.manifestation_type === 'string' ? meta.manifestation_type : '';
    if (type && labels[type]) return labels[type];
    return 'Manifestação do destinatário';
  }
  return null;
}

export default function FiscalDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmCancelNFe, setConfirmCancelNFe] = useState(false);
  const [confirmCCe, setConfirmCCe] = useState(false);
  const [confirmInutilization, setConfirmInutilization] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [confirmSubstitute, setConfirmSubstitute] = useState(false);

  const documentQuery = useQuery({
    queryKey: ['fiscal-document', organizationId, documentId],
    queryFn: () => getFiscalDocument(token!, organizationId!, documentId!),
    enabled: !!token && !!organizationId && !!documentId,
    refetchInterval: (query) => {
      const doc = query.state.data;
      if (!doc) return 2000;
      if (isDocumentInFlight(doc.processing_status)) return 2000;
      if (doc.document_type === 'nfe' && !doc.nfe?.issuer?.legal_name) return 2000;
      return false;
    }
  });

  const inboundNfe =
    documentQuery.data?.direction.toLowerCase() === 'inbound' &&
    documentQuery.data?.document_type.toLowerCase() === 'nfe';

  const orchestrationQuery = useQuery({
    queryKey: ['orchestration', organizationId, documentId],
    queryFn: () => getOrchestration(token!, organizationId!, documentId!),
    enabled: !!token && !!organizationId && !!documentId && inboundNfe
  });

  const document = documentQuery.data;
  const backUrl =
    document?.document_type === 'nfse'
      ? document?.direction === 'outbound'
        ? '/app/nfse/saida'
        : '/app/nfse'
      : document?.direction === 'outbound'
        ? '/app/nfe/saida'
        : '/app/nfe';

  const abortable = documentQuery.data ? canAbortOutboundProcessing(documentQuery.data) : false;
  const isPlatformAdmin = user?.platformRole === 'admin';
  const membersQuery = useQuery({
    queryKey: ['members', organizationId],
    queryFn: () => listMembers(token!, organizationId!),
    enabled: !!token && !!organizationId && abortable && !isPlatformAdmin
  });
  const currentMember = membersQuery.data?.items.find((member) => member.user_id === user?.id);
  const memberRolesQuery = useQuery({
    queryKey: ['member-roles', organizationId, currentMember?.id],
    queryFn: () => listMemberRoles(token!, organizationId!, currentMember!.id),
    enabled: !!token && !!organizationId && abortable && !isPlatformAdmin && !!currentMember?.id
  });
  const isOrgAdmin = (memberRolesQuery.data?.items ?? []).some((role) => role.role_slug === 'administrador');

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: !!token && !!organizationId
  });
  const companyName = companiesQuery.data?.items.find(
    (c) => c.id === document?.organization_company_id
  )?.legal_name;

  const eventsQuery = useQuery({
    queryKey: ['document-events', organizationId, documentId],
    queryFn: () => listDocumentEvents(token!, organizationId!, documentId!),
    enabled:
      !!token &&
      !!organizationId &&
      !!documentId &&
      documentQuery.data?.direction.toLowerCase() === 'outbound' &&
      documentQuery.data?.document_type === 'nfe'
  });
  const manifestationBadge = latestRecipientManifestation(eventsQuery.data?.items ?? []);

  const reprocessMutation = useMutation({
    mutationFn: () => reprocessInboundDocument(token!, organizationId!, documentId!),
    onSuccess: () => {
      toast.success('Documento reprocessado');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['orchestration', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível reprocessar o documento.');
    }
  });

  const resetMutation = useMutation({
    mutationFn: () => resetInboundDocument(token!, organizationId!, documentId!),
    onSuccess: () => {
      setConfirmReset(false);
      toast.success('Nota resetada. A integração será reiniciada a partir do pedido.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['orchestration', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível resetar a nota.');
    }
  });

  const abortMutation = useMutation({
    mutationFn: () => abortOutboundProcessing(token!, organizationId!, documentId!),
    onSuccess: () => {
      setConfirmAbort(false);
      toast.success('Processamento cancelado. A nota pode ser reenviada quando estiver pronta.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível cancelar o processamento.');
    }
  });

  const resubmitMutation = useMutation({
    mutationFn: () => resubmitOutboundDocument(token!, organizationId!, documentId!),
    onSuccess: () => {
      toast.success('Nota enfileirada para reenvio');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível reenviar a nota.');
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (input: { c_motivo: '1' | '2' | '9'; justificativa: string }) =>
      cancelOutboundNFSe(token!, organizationId!, documentId!, input),
    onSuccess: () => {
      setConfirmCancel(false);
      toast.success('Cancelamento enfileirado na SEFIN');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível cancelar a NFS-e.');
    }
  });

  const cancelNFeMutation = useMutation({
    mutationFn: (input: { justificativa: string }) =>
      cancelOutboundNFe(token!, organizationId!, documentId!, input),
    onSuccess: () => {
      setConfirmCancelNFe(false);
      toast.success('Cancelamento enfileirado na SEFAZ');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível cancelar a NF-e.');
    }
  });

  const cceMutation = useMutation({
    mutationFn: (input: { correcao: string; n_seq_evento: number }) =>
      requestOutboundCCe(token!, organizationId!, documentId!, input),
    onSuccess: () => {
      setConfirmCCe(false);
      toast.success('Carta de correção enfileirada na SEFAZ');
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível emitir a CC-e.');
    }
  });

  const protocolMutation = useMutation({
    mutationFn: () => requestOutboundProtocol(token!, organizationId!, documentId!),
    onSuccess: () => {
      toast.success('Consulta de protocolo enfileirada');
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível solicitar o protocolo.');
    }
  });

  const inutilizationMutation = useMutation({
    mutationFn: (input: {
      organization_company_id: string;
      serie: string;
      numero_inicial: number;
      numero_final: number;
      ano: number;
      justificativa: string;
      document_id?: string;
    }) => requestNFeInutilization(token!, organizationId!, input),
    onSuccess: () => {
      setConfirmInutilization(false);
      toast.success('Inutilização enfileirada na SEFAZ');
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível inutilizar a numeração.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFiscalDocument(token!, organizationId!, documentId!),
    onSuccess: () => {
      toast.success('Documento excluído');
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
      navigate(backUrl);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir o documento.');
    }
  });

  const handleDownload = async (payloadType?: string) => {
    if (!token || !organizationId || !documentId) return;
    try {
      await downloadFiscalDocument(token, organizationId, documentId, payloadType);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível baixar o arquivo.');
    }
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Chave de acesso copiada');
    } catch {
      toast.error('Não foi possível copiar a chave');
    }
  };

  if (documentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (documentQuery.isError || !document) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="font-medium">Documento não encontrado</p>
          <p className="text-muted-foreground text-sm">
            {documentQuery.error instanceof ApiError
              ? documentQuery.error.message
              : 'O documento solicitado não existe ou foi removido.'}
          </p>
          <Button asChild variant="outline" className="w-fit">
            <Link to={backUrl}>Voltar para a listagem</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = badgeFor(statusLabels, document.status);
  const processingStatus = badgeFor(processingStatusLabels, document.processing_status);
  const outbound = document.direction.toLowerCase() === 'outbound';
  const isNfeAuthorized =
    document.document_type === 'nfe' &&
    ['authorized', 'cancelled', 'correction_registered'].includes(document.status.toLowerCase());
  const canResubmit =
    outbound &&
    ['rejected', 'failed'].includes(document.status.toLowerCase()) &&
    !isDocumentInFlight(document.processing_status);
  const canAbort = abortable && (isPlatformAdmin || isOrgAdmin);
  const canCancelNFSe =
    outbound &&
    document.document_type === 'nfse' &&
    document.status.toLowerCase() === 'authorized' &&
    !!document.access_key &&
    !isDocumentInFlight(document.processing_status);
  const canCancelNFe =
    outbound &&
    document.document_type === 'nfe' &&
    ['authorized', 'correction_registered'].includes(document.status.toLowerCase()) &&
    !!document.access_key &&
    !isDocumentInFlight(document.processing_status);
  const canCCe = canCancelNFe;
  const canRequestProtocol =
    outbound && document.document_type === 'nfe' && !!document.access_key;
  const canInutilize = outbound && document.document_type === 'nfe';
  const canSubstituteNFSe = canCancelNFSe;
  const canReset =
    orchestrationQuery.isSuccess &&
    canResetInboundDocument(
      document,
      orchestrationQuery.data?.steps,
      orchestrationQuery.data?.has_generated_sap_document
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 overflow-hidden rounded-xl border shadow-sm">
        <div
          className="flex flex-col gap-4 p-5 md:p-6"
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
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {document.number ? (
                  <>
                    {document.document_type === 'nfse' ? 'NFS-e' : 'NF-e'}{' '}
                    <span className="text-primary font-mono tabular-nums">{document.number}</span>
                  </>
                ) : (
                  document.document_key || document.external_id || document.id
                )}
              </h1>

              <div className="flex flex-wrap items-center gap-2">
                {document.series && (
                  <Badge variant="outline" className="font-mono font-normal tabular-nums">
                    Série {document.series}
                  </Badge>
                )}
                <Badge variant="outline" className={cn('gap-1.5 font-normal', status.className)}>
                  <span className={cn('size-1.5 rounded-full', status.dot)} />
                  {status.label}
                </Badge>
                <Badge variant="outline" className={cn('gap-1.5 font-normal', processingStatus.className)}>
                  <span className={cn('size-1.5 rounded-full', processingStatus.dot)} />
                  {processingStatus.label}
                </Badge>
                {operationTypeLabel(document.nfe?.operation_type) && (
                  <Badge variant="outline" className="font-normal">
                    {operationTypeLabel(document.nfe?.operation_type)}
                  </Badge>
                )}
                {finalityLabel(document.nfe?.finality) && (
                  <Badge variant="outline" className="font-normal">
                    {finalityLabel(document.nfe?.finality)}
                  </Badge>
                )}
                <Badge variant="outline" className="font-normal">
                  {document.environment === 'production' ? 'Produção' : 'Homologação'}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {sourceSystemLabel(document.source_system)}
                </Badge>
                {manifestationBadge && (
                  <Badge variant="outline" className="font-normal text-amber-700 dark:text-amber-400">
                    {manifestationBadge}
                  </Badge>
                )}
              </div>

              {document.access_key && (
                <div className="border-border/60 flex min-w-0 items-center gap-2 border-t pt-3">
                  <span className="text-muted-foreground w-14 shrink-0 text-xs">Chave</span>
                  <p
                    className="text-foreground/90 min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-none tracking-[0.12em] whitespace-nowrap select-all sm:text-xs"
                    title={document.access_key}
                  >
                    {document.access_key}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-7 shrink-0"
                    onClick={() => handleCopyKey(document.access_key!)}
                    aria-label="Copiar chave de acesso"
                  >
                    <CopyIcon className="size-3.5" />
                  </Button>
                </div>
              )}

              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {document.issued_at && (
                  <span>
                    <span className="text-foreground/70 font-medium">Emissão </span>
                    {formatDateTime(document.issued_at)}
                  </span>
                )}
                {document.authorized_at && (
                  <span>
                    <span className="text-foreground/70 font-medium">Protocolo </span>
                    {formatDateTime(document.authorized_at)}
                    {document.authorization_protocol ? ` · ${document.authorization_protocol}` : ''}
                  </span>
                )}
                <span>
                  <span className="text-foreground/70 font-medium">Recebido </span>
                  {formatDateTime(document.received_at)}
                </span>
                <span>
                  <span className="text-foreground/70 font-medium">Concluído </span>
                  {formatDateTime(document.completed_at)}
                </span>
                {(document.nfe?.issuer?.legal_name || document.nfse?.issuer?.legal_name || document.issuer_name) && (
                  <span>
                    <span className="text-foreground/70 font-medium">Emitente </span>
                    {document.nfe?.issuer?.legal_name || document.nfse?.issuer?.legal_name || document.issuer_name}
                  </span>
                )}
                {document.nfe?.nature_of_operation && (
                  <span>
                    <span className="text-foreground/70 font-medium">Natureza </span>
                    {document.nfe.nature_of_operation}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {document.status === 'ACTION_REQUIRED' && (
                <Button
                  type="button"
                  size="sm"
                  disabled={reprocessMutation.isPending}
                  onClick={() => reprocessMutation.mutate()}
                >
                  <RefreshCwIcon />
                  {reprocessMutation.isPending ? 'Reprocessando...' : 'Reprocessar'}
                </Button>
              )}
              {canReset && (
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmReset(true)}>
                  <RotateCcwIcon />
                  Resetar
                </Button>
              )}
              {canAbort && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={abortMutation.isPending}
                  onClick={() => setConfirmAbort(true)}
                >
                  <BanIcon />
                  Cancelar processamento
                </Button>
              )}
              {canResubmit && (
                <Button
                  type="button"
                  size="sm"
                  disabled={resubmitMutation.isPending}
                  onClick={() => resubmitMutation.mutate()}
                >
                  <RefreshCwIcon />
                  {resubmitMutation.isPending ? 'Reenviando...' : 'Reenviar'}
                </Button>
              )}
              {canSubstituteNFSe && (
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmSubstitute(true)}>
                  <ReplaceIcon />
                  Substituir
                </Button>
              )}
              {canCCe && (
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmCCe(true)}>
                  <FilePenLineIcon />
                  Carta de correção
                </Button>
              )}
              {canRequestProtocol && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={protocolMutation.isPending}
                  onClick={() => protocolMutation.mutate()}
                >
                  <ScrollTextIcon />
                  {protocolMutation.isPending ? 'Solicitando…' : 'Solicitar protocolo'}
                </Button>
              )}
              {canInutilize && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmInutilization(true)}
                >
                  <HashIcon />
                  Inutilizar
                </Button>
              )}
              {canCancelNFe && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmCancelNFe(true)}
                >
                  <BanIcon />
                  Cancelar
                </Button>
              )}
              {canCancelNFSe && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmCancel(true)}
                >
                  <BanIcon />
                  Cancelar
                </Button>
              )}
              {outbound ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <DownloadIcon />
                      Baixar
                      <ChevronDownIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {document.document_type === 'nfse' ? (
                      <>
                        <DropdownMenuItem
                          onSelect={() => {
                            void handleDownload('provider_request');
                          }}
                        >
                          XML enviado
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void handleDownload('sefaz_response');
                          }}
                        >
                          XML recebido
                        </DropdownMenuItem>
                        {(document.status === 'cancelled' || document.status === 'cancel_requested') && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                void handleDownload('cancel_response');
                              }}
                            >
                              XML de cancelamento
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                void handleDownload('cancel_request');
                              }}
                            >
                              Pedido de cancelamento
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem
                          disabled={document.status !== 'authorized'}
                          onSelect={() => {
                            void handleDownload('danfse');
                          }}
                        >
                          DANFSe
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          disabled={!isNfeAuthorized}
                          onSelect={() => {
                            void handleDownload('sefaz_response');
                          }}
                        >
                          XML da NF-e
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!hasPayload(document, 'protocol')}
                          onSelect={() => {
                            void handleDownload('protocol');
                          }}
                        >
                          XML do protocolo
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!isNfeAuthorized}
                          onSelect={() => {
                            void handleDownload('danfe_retrato');
                          }}
                        >
                          DANFE retrato
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!isNfeAuthorized}
                          onSelect={() => {
                            void handleDownload('danfe_paisagem');
                          }}
                        >
                          DANFE paisagem
                        </DropdownMenuItem>
                        {hasPayload(document, 'danfe') && (
                          <DropdownMenuItem
                            onSelect={() => {
                              void handleDownload('danfe');
                            }}
                          >
                            DANFE do SAP
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          disabled={!hasPayload(document, 'cancel_response')}
                          onSelect={() => {
                            void handleDownload('cancel_response');
                          }}
                        >
                          XML de cancelamento
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!hasPayload(document, 'cce_response')}
                          onSelect={() => {
                            void handleDownload('cce_response');
                          }}
                        >
                          XML da carta de correção
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!hasPayload(document, 'inutilization_response')}
                          onSelect={() => {
                            void handleDownload('inutilization_response');
                          }}
                        >
                          XML de inutilização
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!hasPayload(document, 'manifestation_event')}
                          onSelect={() => {
                            void handleDownload('manifestation_event');
                          }}
                        >
                          XML da manifestação
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void handleDownload('provider_request');
                          }}
                        >
                          XML de envio
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => handleDownload()}>
                  <DownloadIcon />
                  Baixar XML
                </Button>
              )}
              {document.source_system === 'manual_upload' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2Icon />
                  Excluir
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <DocumentStageTracker document={document} companyName={companyName} />

      {(document.issuer_cnpj || document.recipient_document || document.nfe || document.nfse) && (
        <div className="grid gap-4 md:grid-cols-2">
          <NFePartyCard
            role="issuer"
            party={document.nfe?.issuer ?? document.nfse?.issuer}
            fallbackDocument={document.issuer_cnpj}
            fallbackName={document.issuer_name || companyName}
            loading={isInboundProcessing(document.processing_status) && !document.nfe?.issuer?.legal_name && !document.nfse?.issuer?.legal_name}
          />
          <NFePartyCard
            role="recipient"
            party={document.nfe?.recipient ?? document.nfse?.recipient}
            fallbackDocument={document.recipient_document}
            loading={isInboundProcessing(document.processing_status) && !document.nfe?.recipient?.legal_name && !document.nfse?.recipient?.legal_name}
          />
        </div>
      )}

      {document.nfse?.service?.amount != null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Valor do serviço</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-primary/20 bg-primary/5 rounded-md border px-3 py-2 text-sm">
              <p className="text-muted-foreground text-xs">Valor da NFS-e</p>
              <p className="text-primary mt-0.5 font-medium tabular-nums">
                {formatCurrency(document.nfse.service.amount)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {document.nfe?.totals && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Totais e impostos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Produtos', value: document.nfe.totals.products },
                { label: 'Frete', value: document.nfe.totals.freight },
                { label: 'Desconto', value: document.nfe.totals.discount },
                { label: 'Valor da NF-e', value: document.nfe.totals.nf, highlight: true }
              ].map((row) => (
                <div
                  key={row.label}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm',
                    row.highlight && 'border-primary/20 bg-primary/5'
                  )}
                >
                  <p className="text-muted-foreground text-xs">{row.label}</p>
                  <p className={cn('mt-0.5 font-medium tabular-nums', row.highlight && 'text-primary')}>
                    {formatCurrency(row.value)}
                  </p>
                </div>
              ))}
            </div>
            <TotalsTaxChips totals={document.nfe.totals} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <DocumentIntegrationPanel document={document} companyName={companyName} />
        </CardContent>
      </Card>

      <DeleteDocumentDialog
        document={confirmDelete ? document : null}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
      <ResetDocumentDialog
        document={confirmReset ? document : null}
        pending={resetMutation.isPending}
        onOpenChange={(open) => !open && setConfirmReset(false)}
        onConfirm={() => resetMutation.mutate()}
      />
      <AbortProcessingDialog
        document={confirmAbort ? document : null}
        pending={abortMutation.isPending}
        onOpenChange={(open) => !open && setConfirmAbort(false)}
        onConfirm={() => abortMutation.mutate()}
      />
      <CancelNFSeDialog
        document={confirmCancel ? document : null}
        pending={cancelMutation.isPending}
        onOpenChange={(open) => !open && setConfirmCancel(false)}
        onConfirm={(input) => cancelMutation.mutate(input)}
      />
      <CancelNFeDialog
        document={confirmCancelNFe ? document : null}
        pending={cancelNFeMutation.isPending}
        onOpenChange={(open) => !open && setConfirmCancelNFe(false)}
        onConfirm={(input) => cancelNFeMutation.mutate(input)}
      />
      <CCeDialog
        document={confirmCCe ? document : null}
        pending={cceMutation.isPending}
        onOpenChange={(open) => !open && setConfirmCCe(false)}
        onConfirm={(input) => cceMutation.mutate(input)}
      />
      <InutilizationDialog
        document={confirmInutilization ? document : null}
        pending={inutilizationMutation.isPending}
        onOpenChange={(open) => !open && setConfirmInutilization(false)}
        onConfirm={(input) => inutilizationMutation.mutate(input)}
      />
      <SubstituteNFSeDialog
        document={confirmSubstitute ? document : null}
        onOpenChange={(open) => !open && setConfirmSubstitute(false)}
        onConfirm={(input) => {
          setConfirmSubstitute(false);
          const params = new URLSearchParams();
          params.set('substituir', document.id);
          params.set('motivoSubstituicao', input.motivo);
          if (input.justificativa) params.set('justificativaSubstituicao', input.justificativa);
          if (document.organization_company_id) {
            params.set('companyId', document.organization_company_id);
          }
          navigate(`/app/nfse/saida/nova/emitir?${params.toString()}`);
        }}
      />
    </div>
  );
}
