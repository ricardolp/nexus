import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  BanIcon,
  ReplaceIcon,
  Trash2Icon
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  cancelOutboundNFSe,
  deleteFiscalDocument,
  downloadFiscalDocument,
  getFiscalDocument,
  getOrchestration,
  listCompanies,
  reprocessInboundDocument,
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
import { CancelNFSeDialog } from './cancel-nfse-dialog';
import { DeleteDocumentDialog } from './delete-document-dialog';
import { ResetDocumentDialog } from './reset-document-dialog';
import { DocumentIntegrationPanel } from './document-integration-panel';
import { DocumentStageTracker } from './document-stage-tracker';
import {
  formatDateTime,
  formatCurrency,
  canResetInboundDocument,
  isDocumentInFlight,
  isInboundProcessing,
  operationTypeLabel,
  finalityLabel,
  sourceSystemLabel
} from './format';
import { NFePartyCard } from './nfe-party-card';
import { TotalsTaxChips } from './nfe-tax-chips';
import { badgeFor, processingStatusLabels, statusLabels } from './status-labels';
import { SubstituteNFSeDialog } from './substitute-nfse-dialog';

export default function FiscalDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
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

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: !!token && !!organizationId
  });
  const companyName = companiesQuery.data?.items.find(
    (c) => c.id === document?.organization_company_id
  )?.legal_name;

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
  const canResubmit =
    outbound &&
    ['rejected', 'failed'].includes(document.status.toLowerCase()) &&
    !isDocumentInFlight(document.processing_status);
  const canCancelNFSe =
    outbound &&
    document.document_type === 'nfse' &&
    document.status.toLowerCase() === 'authorized' &&
    !!document.access_key &&
    !isDocumentInFlight(document.processing_status);
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
                          onSelect={() => {
                            void handleDownload('provider_request');
                          }}
                        >
                          XML de envio
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void handleDownload('sefaz_response');
                          }}
                        >
                          Retorno da autoridade
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
      <CancelNFSeDialog
        document={confirmCancel ? document : null}
        pending={cancelMutation.isPending}
        onOpenChange={(open) => !open && setConfirmCancel(false)}
        onConfirm={(input) => cancelMutation.mutate(input)}
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
