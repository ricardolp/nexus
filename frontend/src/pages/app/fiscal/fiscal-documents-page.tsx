import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  FileSearchIcon,
  FileUpIcon,
  HashIcon,
  KeyRoundIcon,
  ListChecksIcon,
  SearchIcon,
  type LucideIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  deleteFiscalDocument,
  downloadFiscalDocument,
  downloadFiscalDocumentsZip,
  listFiscalDocumentQueries,
  listFiscalDocuments,
  listPendingFiscalDocuments,
  requestFiscalDocumentManifestation
} from '@/lib/endpoints';
import type { ApiFiscalDocument, ApiPendingFiscalDocument, FiscalQueryType } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkActionBar } from './bulk-action-bar';
import { getFiscalDocumentColumns } from './columns';
import { DeleteDocumentDialog } from './delete-document-dialog';
import { FiscalQueryDialog } from './fiscal-query-dialog';
import { getFiscalQueryColumns } from './fiscal-query-columns';
import { KpiSummaryCards } from './kpi-summary-cards';
import { ManifestCienciaDialog } from './manifest-ciencia-dialog';
import { getPendingDocumentColumns } from './pending-document-columns';
import { documentListBucket, type DocumentListFilter } from './status-labels';
import { isInboundProcessing } from './format';
import { XMLUploadDialog } from './xml-upload-dialog';

type ListTab = 'documents' | 'pending' | 'queries';

const QUERY_DIALOG_CONFIG: Record<
  FiscalQueryType,
  { icon: LucideIcon; title: string; description: string; menuLabel: string }
> = {
  chave: {
    icon: KeyRoundIcon,
    title: 'Consultar por chave',
    description: 'Busca uma nota específica no SEFAZ a partir da chave de acesso.',
    menuLabel: 'Consultar por chave'
  },
  nsu: {
    icon: HashIcon,
    title: 'Consultar por NSU',
    description: 'Busca no SEFAZ todos os documentos disponíveis a partir de um NSU inicial.',
    menuLabel: 'Consultar por NSU'
  },
  batch: {
    icon: ListChecksIcon,
    title: 'Consulta em lote',
    description: 'Cole várias chaves de acesso para localizá-las no SEFAZ de uma vez.',
    menuLabel: 'Consulta em lote (colar chaves)'
  }
};

export function FiscalDocumentsPage({
  documentType,
  icon: Icon,
  title,
  description
}: {
  documentType: 'nfe' | 'nfse';
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentListFilter>('all');
  const [listTab, setListTab] = useState<ListTab>('documents');
  const [activeQueryDialog, setActiveQueryDialog] = useState<FiscalQueryType | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [documentPendingDelete, setDocumentPendingDelete] = useState<ApiFiscalDocument | null>(null);
  const [documentPendingManifest, setDocumentPendingManifest] = useState<ApiPendingFiscalDocument | null>(null);

  const enabled = !!token && !!organizationId;
  const isNfe = documentType === 'nfe';

  const documentsQuery = useQuery({
    queryKey: ['fiscal-documents', organizationId, documentType],
    queryFn: () =>
      listFiscalDocuments(token!, organizationId!, {
        documentType,
        limit: 200
      }),
    enabled,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((d) => isInboundProcessing(d.processing_status)) ? 2000 : false;
    }
  });

  const pendingDocumentsQuery = useQuery({
    queryKey: ['fiscal-documents-pending', organizationId],
    queryFn: () => listPendingFiscalDocuments(token!, organizationId!, 200),
    enabled: enabled && isNfe
  });

  const sefazQueriesQuery = useQuery({
    queryKey: ['fiscal-document-queries', organizationId],
    queryFn: () => listFiscalDocumentQueries(token!, organizationId!, 50),
    enabled: enabled && isNfe,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((q) => q.status === 'pending' || q.status === 'processing') ? 2000 : false;
    }
  });

  const documents = documentsQuery.data?.items ?? [];
  const pendingDocuments = pendingDocumentsQuery.data?.items ?? [];
  const sefazQueries = sefazQueriesQuery.data?.items ?? [];
  const pendingManifestationCount = pendingDocuments.filter((d) => d.status === 'pending').length;
  const inFlightQueryCount = sefazQueries.filter((q) => q.status === 'pending' || q.status === 'processing').length;

  const filteredDocuments = useMemo(() => {
    const byStatus =
      statusFilter === 'all' ? documents : documents.filter((d) => documentListBucket(d.status) === statusFilter);
    const query = search.trim().toLowerCase();
    if (!query) return byStatus;
    return byStatus.filter(
      (d) =>
        (d.document_key ?? '').toLowerCase().includes(query) ||
        (d.access_key ?? '').toLowerCase().includes(query) ||
        (d.number ?? '').toLowerCase().includes(query) ||
        (d.external_id ?? '').toLowerCase().includes(query) ||
        (d.issuer_name ?? '').toLowerCase().includes(query) ||
        d.source_system.toLowerCase().includes(query)
    );
  }, [documents, search, statusFilter]);

  const filteredPendingDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pendingDocuments;
    return pendingDocuments.filter(
      (d) =>
        d.chave.toLowerCase().includes(query) ||
        (d.nome_emitente ?? '').toLowerCase().includes(query) ||
        (d.cnpj_emitente ?? '').toLowerCase().includes(query)
    );
  }, [pendingDocuments, search]);

  const filteredSefazQueries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sefazQueries;
    return sefazQueries.filter((q) => JSON.stringify(q.params_json ?? {}).toLowerCase().includes(query));
  }, [sefazQueries, search]);

  const manifestMutation = useMutation({
    mutationFn: (doc: ApiPendingFiscalDocument) =>
      requestFiscalDocumentManifestation(token!, organizationId!, doc.organization_company_id, doc.id),
    onSuccess: () => {
      toast.success('Ciência da Operação enviada — acompanhe o status nesta lista.');
      setDocumentPendingManifest(null);
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents-pending', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível enviar a Ciência da Operação.');
    }
  });

  const handleDownload = async (doc: ApiFiscalDocument) => {
    if (!token || !organizationId) return;
    try {
      await downloadFiscalDocument(token, organizationId, doc.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível baixar o XML.');
    }
  };

  const zipDownloadMutation = useMutation({
    mutationFn: (docs: ApiFiscalDocument[]) =>
      downloadFiscalDocumentsZip(
        token!,
        organizationId!,
        docs.map((d) => d.id)
      ),
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível baixar o ZIP.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (doc: ApiFiscalDocument) => deleteFiscalDocument(token!, organizationId!, doc.id),
    onSuccess: () => {
      toast.success('Documento excluído');
      setDocumentPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir o documento.');
    }
  });

  const columns = useMemo(
    () =>
      getFiscalDocumentColumns(
        (doc) => navigate(`/app/${documentType}/${doc.id}`),
        handleDownload,
        (doc) => setDocumentPendingDelete(doc)
      ),
    [token, organizationId, documentType, navigate]
  );

  const pendingColumns = useMemo(() => getPendingDocumentColumns((doc) => setDocumentPendingManifest(doc)), []);
  const queryColumns = useMemo(() => getFiscalQueryColumns(), []);

  const searchPlaceholder =
    listTab === 'pending'
      ? 'Buscar por chave ou emitente...'
      : listTab === 'queries'
        ? 'Buscar consulta por chave...'
        : 'Buscar por chave, emitente ou número...';

  const consultButton = isNfe ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <FileSearchIcon />
          Consultar SEFAZ
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(QUERY_DIALOG_CONFIG) as FiscalQueryType[]).map((type) => (
          <DropdownMenuItem
            key={type}
            onSelect={() => {
              setTimeout(() => setActiveQueryDialog(type), 0);
            }}
          >
            {QUERY_DIALOG_CONFIG[type].menuLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {organizationId && listTab === 'documents' && !documentsQuery.isLoading && !documentsQuery.isError && (
        <KpiSummaryCards documents={documents} activeFilter={statusFilter} onFilterChange={setStatusFilter} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {!organizationId ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma organização associada à sua conta no momento.
            </p>
          ) : (
            <Tabs
              value={isNfe ? listTab : 'documents'}
              onValueChange={(value) => {
                setSearch('');
                setListTab(value as ListTab);
              }}
            >
              {isNfe && (
                <TabsList className="mb-4">
                  <TabsTrigger value="documents">Documentos</TabsTrigger>
                  <TabsTrigger value="pending" className="gap-1.5">
                    Aguardando ciência
                    {pendingManifestationCount > 0 && (
                      <Badge variant="secondary" className="h-5 min-w-5 px-1">
                        {pendingManifestationCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="queries" className="gap-1.5">
                    Consultas SEFAZ
                    {inFlightQueryCount > 0 && (
                      <Badge variant="secondary" className="h-5 min-w-5 px-1">
                        {inFlightQueryCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              )}

              <TabsContent value="documents">
                {documentsQuery.isLoading ? (
                  <DataTableSkeleton columnCount={9} />
                ) : documentsQuery.isError ? (
                  <p className="text-destructive text-sm">
                    {documentsQuery.error instanceof ApiError
                      ? documentsQuery.error.message
                      : 'Não foi possível carregar os documentos fiscais.'}
                  </p>
                ) : (
                  <DataTable
                    columns={columns}
                    data={filteredDocuments}
                    onRowClick={(doc) => navigate(`/app/${documentType}/${doc.id}`)}
                    toolbar={(table) => (
                      <div className="flex w-full flex-col gap-2">
                        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="relative w-full max-w-sm">
                            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                            <Input
                              placeholder={searchPlaceholder}
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              className="pl-8"
                            />
                          </div>
                          <Button
                            variant="outline"
                            className="sm:ml-auto"
                            onClick={() => setUploadDialogOpen(true)}
                          >
                            <FileUpIcon />
                            Importar XML
                          </Button>
                          {consultButton}
                        </div>
                        {table.getFilteredSelectedRowModel().rows.length > 0 && (
                          <BulkActionBar
                            table={table}
                            downloading={zipDownloadMutation.isPending}
                            onDownloadZip={(docs) => zipDownloadMutation.mutate(docs)}
                          />
                        )}
                      </div>
                    )}
                  />
                )}
              </TabsContent>

              {isNfe && (
                <TabsContent value="pending">
                  {pendingDocumentsQuery.isLoading ? (
                    <DataTableSkeleton columnCount={6} />
                  ) : pendingDocumentsQuery.isError ? (
                    <p className="text-destructive text-sm">
                      {pendingDocumentsQuery.error instanceof ApiError
                        ? pendingDocumentsQuery.error.message
                        : 'Não foi possível carregar as notas aguardando ciência.'}
                    </p>
                  ) : (
                    <DataTable
                      columns={pendingColumns}
                      data={filteredPendingDocuments}
                      toolbar={() => (
                        <div className="relative w-full max-w-sm">
                          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                          <Input
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                          />
                        </div>
                      )}
                    />
                  )}
                </TabsContent>
              )}

              {isNfe && (
                <TabsContent value="queries">
                  {sefazQueriesQuery.isLoading ? (
                    <DataTableSkeleton columnCount={5} />
                  ) : sefazQueriesQuery.isError ? (
                    <p className="text-destructive text-sm">
                      {sefazQueriesQuery.error instanceof ApiError
                        ? sefazQueriesQuery.error.message
                        : 'Não foi possível carregar as consultas ao SEFAZ.'}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {inFlightQueryCount > 0 && (
                        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
                          {inFlightQueryCount === 1 ? '1 consulta' : `${inFlightQueryCount} consultas`} na fila ou em
                          andamento. Esta lista atualiza sozinha. A nota só aparece em Documentos depois que o SEFAZ
                          devolver o XML completo.
                        </p>
                      )}
                      <DataTable
                        columns={queryColumns}
                        data={filteredSefazQueries}
                        toolbar={() => (
                          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative w-full max-w-sm">
                              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                              <Input
                                placeholder={searchPlaceholder}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                            <div className="sm:ml-auto">{consultButton}</div>
                          </div>
                        )}
                      />
                    </div>
                  )}
                </TabsContent>
              )}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <XMLUploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} />

      <DeleteDocumentDialog
        document={documentPendingDelete}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => !open && setDocumentPendingDelete(null)}
        onConfirm={() => documentPendingDelete && deleteMutation.mutate(documentPendingDelete)}
      />

      <ManifestCienciaDialog
        document={documentPendingManifest}
        pending={manifestMutation.isPending}
        onOpenChange={(open) => !open && setDocumentPendingManifest(null)}
        onConfirm={() => documentPendingManifest && manifestMutation.mutate(documentPendingManifest)}
      />

      {activeQueryDialog && (
        <FiscalQueryDialog
          type={activeQueryDialog}
          icon={QUERY_DIALOG_CONFIG[activeQueryDialog].icon}
          title={QUERY_DIALOG_CONFIG[activeQueryDialog].title}
          description={QUERY_DIALOG_CONFIG[activeQueryDialog].description}
          open={!!activeQueryDialog}
          onOpenChange={(open) => !open && setActiveQueryDialog(null)}
          onStarted={() => setListTab('queries')}
        />
      )}
    </div>
  );
}
