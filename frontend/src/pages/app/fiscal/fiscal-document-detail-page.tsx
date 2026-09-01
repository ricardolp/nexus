import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
  Trash2Icon
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  deleteFiscalDocument,
  downloadFiscalDocument,
  getFiscalDocument,
  listCompanies,
  reprocessInboundDocument
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DeleteDocumentDialog } from './delete-document-dialog';
import { DocumentIntegrationPanel } from './document-integration-panel';
import { formatDateTime, formatCurrency, isInboundProcessing, operationTypeLabel, finalityLabel } from './format';
import { NFePartyCard } from './nfe-party-card';
import { TotalsTaxChips } from './nfe-tax-chips';
import { badgeFor, processingStatusLabels, statusLabels } from './status-labels';

export default function FiscalDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const documentQuery = useQuery({
    queryKey: ['fiscal-document', organizationId, documentId],
    queryFn: () => getFiscalDocument(token!, organizationId!, documentId!),
    enabled: !!token && !!organizationId && !!documentId,
    refetchInterval: (query) => {
      const doc = query.state.data;
      if (!doc) return 2000;
      if (isInboundProcessing(doc.processing_status)) return 2000;
      if (doc.document_type === 'nfe' && !doc.nfe?.issuer?.legal_name) return 2000;
      return false;
    }
  });

  const document = documentQuery.data;
  const backUrl = document?.document_type === 'nfse' ? '/app/nfse' : '/app/nfe';

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
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível reprocessar o documento.');
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

  const handleDownload = async () => {
    if (!token || !organizationId || !documentId) return;
    try {
      await downloadFiscalDocument(token, organizationId, documentId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível baixar o XML.');
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
                    NF-e <span className="text-primary font-mono tabular-nums">{document.number}</span>
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
                  {document.source_system}
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
                {(document.nfe?.issuer?.legal_name || document.issuer_name) && (
                  <span>
                    <span className="text-foreground/70 font-medium">Emitente </span>
                    {document.nfe?.issuer?.legal_name || document.issuer_name}
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
              <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                <DownloadIcon />
                Baixar XML
              </Button>
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

      {isInboundProcessing(document.processing_status) && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
            <ClockIcon className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Processando em segundo plano</p>
            <p className="text-muted-foreground mt-0.5 text-sm">
              A nota já foi recebida. Extração de itens, impostos e matching com o SAP continuam sem travar a
              tela — esta página atualiza sozinha.
            </p>
          </div>
        </div>
      )}

      {(document.issuer_cnpj || document.recipient_document || document.nfe) && (
        <div className="grid gap-4 md:grid-cols-2">
          <NFePartyCard
            role="issuer"
            party={document.nfe?.issuer}
            fallbackDocument={document.issuer_cnpj}
            loading={isInboundProcessing(document.processing_status) && !document.nfe?.issuer?.legal_name}
          />
          <NFePartyCard
            role="recipient"
            party={document.nfe?.recipient}
            fallbackDocument={document.recipient_document}
            loading={isInboundProcessing(document.processing_status) && !document.nfe?.recipient?.legal_name}
          />
        </div>
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
    </div>
  );
}
