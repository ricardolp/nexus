import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiFaqMessage } from '@/lib/api-types';
import {
  createFaqMessage,
  listFaqMessages,
  listFaqMissingHits,
  listFaqTopHits,
  listOrganizations,
  setFaqMessageActive,
  updateFaqMessage,
  type FaqMessageInput
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getFaqColumns } from './columns';
import { FaqFormSheet, type FaqFormDefaults } from './faq-form-sheet';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AdminFaqPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('messages');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ApiFaqMessage | null>(null);
  const [createDefaults, setCreateDefaults] = useState<FaqFormDefaults | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['admin-faq-messages', source, activeFilter],
    queryFn: () =>
      listFaqMessages(token!, {
        source: source === 'all' ? undefined : source,
        active: activeFilter === 'all' ? undefined : activeFilter === 'true',
        limit: 200
      }),
    enabled: !!token
  });

  const orgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token
  });

  const missingQuery = useQuery({
    queryKey: ['admin-faq-hits-missing', orgFilter],
    queryFn: () =>
      listFaqMissingHits(token!, {
        organization_id: orgFilter === 'all' ? undefined : orgFilter,
        limit: 50
      }),
    enabled: !!token && tab === 'backlog'
  });

  const topQuery = useQuery({
    queryKey: ['admin-faq-hits-top', orgFilter],
    queryFn: () =>
      listFaqTopHits(token!, {
        organization_id: orgFilter === 'all' ? undefined : orgFilter,
        limit: 50
      }),
    enabled: !!token && tab === 'backlog'
  });

  const saveMutation = useMutation({
    mutationFn: async (input: FaqMessageInput & { id?: string }) => {
      const { id, ...body } = input;
      if (id) return updateFaqMessage(token!, id, body);
      return createFaqMessage(token!, body);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.id ? 'Mensagem atualizada' : 'Mensagem criada');
      setSheetOpen(false);
      setEditing(null);
      setCreateDefaults(null);
      queryClient.invalidateQueries({ queryKey: ['admin-faq-messages'] });
      queryClient.invalidateQueries({ queryKey: ['admin-faq-hits-missing'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar a mensagem.');
    }
  });

  const toggleMutation = useMutation({
    mutationFn: (msg: ApiFaqMessage) => setFaqMessageActive(token!, msg.id, !msg.active),
    onSuccess: (msg) => {
      toast.success(msg.active ? 'Mensagem ativada' : 'Mensagem desativada');
      queryClient.invalidateQueries({ queryKey: ['admin-faq-messages'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível alterar o status.');
    }
  });

  const filtered = useMemo(() => {
    const items = messagesQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.source.toLowerCase().includes(q)
    );
  }, [messagesQuery.data, search]);

  const columns = useMemo(
    () =>
      getFaqColumns(
        (msg) => {
          setEditing(msg);
          setCreateDefaults(null);
          setSheetOpen(true);
        },
        (msg) => toggleMutation.mutate(msg)
      ),
    [toggleMutation]
  );

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of orgsQuery.data?.items ?? []) {
      map.set(org.id, org.legal_name);
    }
    return map;
  }, [orgsQuery.data]);

  function openCreate(defaults?: FaqFormDefaults) {
    setEditing(null);
    setCreateDefaults(defaults ?? null);
    setSheetOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpenIcon className="text-muted-foreground size-5" />
            FAQ mensagens
          </CardTitle>
          <CardDescription>
            Curadoria de orientações operacionais por código de erro (SEFAZ, SAP, API, Nexus) e
            backlog de consultas do monitor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="messages">Mensagens</TabsTrigger>
              <TabsTrigger value="backlog">Backlog</TabsTrigger>
            </TabsList>

            <TabsContent value="messages" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-wrap gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar código, título..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="SEFAZ">SEFAZ</SelectItem>
                      <SelectItem value="SAP">SAP</SelectItem>
                      <SelectItem value="API">API</SelectItem>
                      <SelectItem value="NEXUS">NEXUS</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activeFilter} onValueChange={setActiveFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Ativos e inativos</SelectItem>
                      <SelectItem value="true">Somente ativos</SelectItem>
                      <SelectItem value="false">Somente inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => openCreate()}>
                  <PlusIcon className="size-4" />
                  Nova mensagem
                </Button>
              </div>

              {messagesQuery.isLoading ? (
                <DataTableSkeleton columnCount={7} rowCount={8} />
              ) : messagesQuery.isError ? (
                <p className="text-destructive text-sm">
                  {messagesQuery.error instanceof ApiError
                    ? messagesQuery.error.message
                    : 'Falha ao carregar mensagens.'}
                </p>
              ) : (
                <DataTable columns={columns} data={filtered} />
              )}
            </TabsContent>

            <TabsContent value="backlog" className="space-y-6">
              <div className="flex items-center gap-2">
                <Select value={orgFilter} onValueChange={setOrgFilter}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Organização" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as organizações</SelectItem>
                    {(orgsQuery.data?.items ?? []).map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Códigos sem artigo (found=false)</h3>
                {missingQuery.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Docsta</TableHead>
                        <TableHead>Consultas</TableHead>
                        <TableHead>Última</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(missingQuery.data?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground text-center">
                            Nenhum código pendente.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (missingQuery.data?.items ?? []).map((hit) => (
                          <TableRow key={`${hit.source}:${hit.code}:${hit.docsta}`}>
                            <TableCell>{hit.source}</TableCell>
                            <TableCell className="font-mono text-sm">{hit.code}</TableCell>
                            <TableCell>{hit.docsta || '—'}</TableCell>
                            <TableCell>{hit.count}</TableCell>
                            <TableCell>{formatDateTime(hit.last_seen)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openCreate({
                                    source: hit.source,
                                    code: hit.code,
                                    docsta: hit.docsta
                                  })
                                }
                              >
                                Criar artigo
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Mais consultados</h3>
                {topQuery.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Docsta</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Found</TableHead>
                        <TableHead>Missing</TableHead>
                        <TableHead>Última</TableHead>
                        {orgFilter !== 'all' ? <TableHead>Org</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(topQuery.data?.items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={orgFilter !== 'all' ? 8 : 7}
                            className="text-muted-foreground text-center"
                          >
                            Sem consultas registradas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (topQuery.data?.items ?? []).map((hit) => (
                          <TableRow key={`top:${hit.source}:${hit.code}:${hit.docsta}`}>
                            <TableCell>{hit.source}</TableCell>
                            <TableCell className="font-mono text-sm">{hit.code}</TableCell>
                            <TableCell>{hit.docsta || '—'}</TableCell>
                            <TableCell>{hit.count}</TableCell>
                            <TableCell>{hit.found_count}</TableCell>
                            <TableCell>{hit.missing_count}</TableCell>
                            <TableCell>{formatDateTime(hit.last_seen)}</TableCell>
                            {orgFilter !== 'all' ? (
                              <TableCell>
                                {hit.organization_id
                                  ? (orgNameById.get(hit.organization_id) ?? hit.organization_id)
                                  : (orgNameById.get(orgFilter) ?? orgFilter)}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <FaqFormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditing(null);
            setCreateDefaults(null);
          }
        }}
        message={editing}
        defaults={createDefaults}
        submitting={saveMutation.isPending}
        onSubmit={async (values) => {
          await saveMutation.mutateAsync({
            ...values,
            id: editing?.id
          });
        }}
      />
    </>
  );
}
