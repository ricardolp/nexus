import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  FileSearchIcon,
  FileUpIcon,
  HashIcon,
  KeyRoundIcon,
  ListChecksIcon,
  SearchIcon,
  XIcon,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
type DocumentSearchField = 'number' | 'partner' | 'access_key';

const DOCUMENT_SEARCH_FIELDS: { id: DocumentSearchField; label: string }[] = [
  { id: 'number', label: 'Número' },
  { id: 'partner', label: 'Parceiro' },
  { id: 'access_key', label: 'Chave' }
];

const ALL_SEARCH_FIELDS = DOCUMENT_SEARCH_FIELDS.map((field) => field.id);

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
  description,
  direction = 'inbound',
  toolbarExtra
}: {
  documentType: 'nfe' | 'nfse';
  icon: LucideIcon;
  title: string;
  description: string;
  direction?: 'inbound' | 'outbound';
  toolbarExtra?: ReactNode;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [draftFields, setDraftFields] = useState<DocumentSearchField[]>(ALL_SEARCH_FIELDS);
  const [appliedSearch, setAppliedSearch] = useState<{ query: string; fields: DocumentSearchField[] }>({
    query: '',
    fields: ALL_SEARCH_FIELDS
  });
  const [statusFilter, setStatusFilter] = useState<DocumentListFilter>('all');
  const [listTab, setListTab] = useState<ListTab>('documents');
  const [activeQueryDialog, setActiveQueryDialog] = useState<FiscalQueryType | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [documentPendingDelete, setDocumentPendingDelete] = useState<ApiFiscalDocument | null>(null);
  const [documentPendingManifest, setDocumentPendingManifest] = useState<ApiPendingFiscalDocument | null>(null);

  const enabled = !!token && !!organizationId;
  const isNfe = documentType === 'nfe';
  const isOutbound = direction === 'outbound';
  const showInboundExtras = isNfe && !isOutbound;
  const detailBasePath = isOutbound
    ? documentType === 'nfse'
      ? '/app/nfse/saida'
      : '/app/nfe/saida'
    : `/app/${documentType}`;

  const documentsQuery = useQuery({
    queryKey: ['fiscal-documents', organizationId, documentType, direction, appliedSearch],
    queryFn: () =>
      listFiscalDocuments(token!, organizationId!, {
        documentType,
        direction,
        q: appliedSearch.query || undefined,
        fields: appliedSearch.query ? appliedSearch.fields.join(',') : undefined,
        limit: 200
      }),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      if (isOutbound) {
        return items.some(
          (d) =>
            d.processing_status === 'queued' ||
            d.processing_status === 'waiting_external' ||
            d.processing_status === 'processing' ||
            d.processing_status === 'retry_scheduled'
        )
          ? 2000
          : false;
      }
      return items.some((d) => isInboundProcessing(d.processing_status)) ? 2000 : false;
    }
  });

  const pendingDocumentsQuery = useQuery({
    queryKey: ['fiscal-documents-pending', organizationId],
    queryFn: () => listPendingFiscalDocuments(token!, organizationId!, 200),
    enabled: enabled && showInboundExtras
  });

  const sefazQueriesQuery = useQuery({
    queryKey: ['fiscal-document-queries', organizationId],
    queryFn: () => listFiscalDocumentQueries(token!, organizationId!, 50),
    enabled: enabled && showInboundExtras,
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
    if (statusFilter === 'all') return documents;
    return documents.filter((d) => documentListBucket(d.status) === statusFilter);
  }, [documents, statusFilter]);

  const filteredPendingDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pendingDocuments;
    const digits = query.replace(/\D/g, '');
    return pendingDocuments.filter(
      (d) =>
        d.chave.toLowerCase().includes(query) ||
        (digits.length >= 8 && d.chave.replace(/\D/g, '').includes(digits)) ||
        (d.nome_emitente ?? '').toLowerCase().includes(query) ||
        (d.cnpj_emitente ?? '').toLowerCase().includes(query) ||
        (digits.length >= 3 && (d.cnpj_emitente ?? '').replace(/\D/g, '').includes(digits))
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
        (doc) => navigate(`${detailBasePath}/${doc.id}`),
        handleDownload,
        (doc) => setDocumentPendingDelete(doc)
      ),
    [token, organizationId, detailBasePath, navigate]
  );

  const pendingColumns = useMemo(() => getPendingDocumentColumns((doc) => setDocumentPendingManifest(doc)), []);
  const queryColumns = useMemo(() => getFiscalQueryColumns(), []);

  const searchPlaceholder =
    listTab === 'pending'
      ? 'Buscar por chave ou emitente...'
      : listTab === 'queries'
        ? 'Buscar consulta por chave...'
        : draftFields.length === 1
          ? `Buscar por ${DOCUMENT_SEARCH_FIELDS.find((field) => field.id === draftFields[0])?.label.toLowerCase()}...`
          : 'Buscar e pressione Enter';

  const searchFieldLabel =
    draftFields.length === DOCUMENT_SEARCH_FIELDS.length
      ? 'Todos os campos'
      : DOCUMENT_SEARCH_FIELDS.filter((field) => draftFields.includes(field.id))
          .map((field) => field.label)
          .join(', ');

  const showTableSkeleton = documentsQuery.isLoading || documentsQuery.isPlaceholderData;
  const hasAppliedSearch = Boolean(appliedSearch.query);

  function toggleSearchField(id: DocumentSearchField) {
    setDraftFields((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((field) => field !== id);
      }
      return [...current, id];
    });
  }

  function applyDocumentSearch() {
    setAppliedSearch({
      query: draftQuery.trim(),
      fields: draftFields.length ? draftFields : ALL_SEARCH_FIELDS
    });
  }

  function clearDocumentSearch() {
    setDraftQuery('');
    setAppliedSearch({ query: '', fields: draftFields.length ? draftFields : ALL_SEARCH_FIELDS });
  }

  function handleDocumentSearchSubmit(event: FormEvent) {
    event.preventDefault();
    applyDocumentSearch();
  }

  const consultButton = showInboundExtras ? (
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
    <div className="flex flex-col gap-6" data-tour="fiscal-list">
      {organizationId && listTab === 'documents' && documentsQuery.data && !documentsQuery.isError && (
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
              value={showInboundExtras ? listTab : 'documents'}
              onValueChange={(value) => {
                setSearch('');
                setListTab(value as ListTab);
              }}
            >
              {showInboundExtras && (
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
                <div className="flex flex-col gap-4">
                  <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
                    <form
                      className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                      onSubmit={handleDocumentSearchSubmit}
                    >
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" className="w-full justify-between sm:w-48">
                            <span className="truncate">{searchFieldLabel}</span>
                            <ChevronDownIcon />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-2">
                          {DOCUMENT_SEARCH_FIELDS.map((field) => (
                            <label
                              key={field.id}
                              className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                            >
                              <Checkbox
                                checked={draftFields.includes(field.id)}
                                onCheckedChange={() => toggleSearchField(field.id)}
                              />
                              {field.label}
                            </label>
                          ))}
                        </PopoverContent>
                      </Popover>
                      <div className="relative min-w-0 flex-1">
                        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input
                          placeholder={searchPlaceholder}
                          value={draftQuery}
                          onChange={(e) => setDraftQuery(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                      <Button type="submit">
                        <SearchIcon />
                        Pesquisar
                      </Button>
                      {hasAppliedSearch && (
                        <Button type="button" variant="ghost" onClick={clearDocumentSearch}>
                          <XIcon />
                          Limpar
                        </Button>
                      )}
                    </form>
                    <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                      {showInboundExtras && (
                        <Button type="button" variant="outline" onClick={() => setUploadDialogOpen(true)}>
                          <FileUpIcon />
                          Importar XML
                        </Button>
                      )}
                      {toolbarExtra}
                      {consultButton}
                    </div>
                  </div>

                  {documentsQuery.isError ? (
                    <p className="text-destructive text-sm">
                      {documentsQuery.error instanceof ApiError
                        ? documentsQuery.error.message
                        : 'Não foi possível carregar os documentos fiscais.'}
                    </p>
                  ) : showTableSkeleton ? (
                    <DataTableSkeleton columnCount={9} includeToolbar={false} />
                  ) : (
                    <DataTable
                      columns={columns}
                      data={filteredDocuments}
                      onRowClick={(doc) => navigate(`${detailBasePath}/${doc.id}`)}
                      toolbar={(table) =>
                        table.getFilteredSelectedRowModel().rows.length > 0 ? (
                          <BulkActionBar
                            table={table}
                            downloading={zipDownloadMutation.isPending}
                            onDownloadZip={(docs) => zipDownloadMutation.mutate(docs)}
                          />
                        ) : null
                      }
                    />
                  )}
                </div>
              </TabsContent>

              {showInboundExtras && (
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

              {showInboundExtras && (
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
