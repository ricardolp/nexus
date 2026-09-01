import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ActivityIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDotIcon,
  ClockIcon,
  HeadsetIcon,
  HelpCircleIcon,
  KeyRoundIcon,
  MailIcon,
  MessageSquarePlusIcon,
  PaperclipIcon,
  PlugZapIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
  TicketIcon,
  WalletIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { listFiscalDocuments } from '@/lib/endpoints';
import type { ApiFiscalDocument } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';
import { SectionNav } from '@/components/layout/section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  addSupportTicketMessage,
  createSupportTicket,
  downloadSupportAttachment,
  getSupportConfig,
  getSupportTicket,
  listSupportTickets,
  uploadSupportAttachment,
  type SupportTicket
} from '@/modules/support/client';
import { TicketEditor } from '@/modules/support/components/ticket-editor';
import { TicketHtml, ticketPlainText } from '@/modules/support/components/ticket-html';
import {
  faqItems,
  TICKET_PRIORITY_LABELS,
  type FaqCategory,
  type TicketFiscalRef,
  type TicketPriority,
  type TicketStatus
} from '@/modules/support/data';
import { StatusTab } from '@/modules/support/pages/support-status';

type TabId = 'faq' | 'tickets' | 'contact' | 'status';

const PAGE_SIZE = 10;

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'faq', label: 'FAQ', icon: <BookOpenIcon className="size-4" /> },
  { id: 'tickets', label: 'Meus chamados', icon: <TicketIcon className="size-4" /> },
  { id: 'contact', label: 'Fale conosco', icon: <MessageSquarePlusIcon className="size-4" /> },
  { id: 'status', label: 'Status do sistema', icon: <ActivityIcon className="size-4" /> }
];

const categoryLabels: Record<FaqCategory | 'all', string> = {
  all: 'Todos',
  geral: 'Geral',
  nfe: 'NF-e',
  conta: 'Conta',
  seguranca: 'Segurança',
  integracoes: 'Integrações'
};

const categoryIcons: Record<FaqCategory, React.ReactNode> = {
  geral: <HelpCircleIcon className="size-3.5" />,
  nfe: <WalletIcon className="size-3.5" />,
  conta: <HeadsetIcon className="size-3.5" />,
  seguranca: <ShieldIcon className="size-3.5" />,
  integracoes: <PlugZapIcon className="size-3.5" />
};

const categoryColors: Record<FaqCategory, string> = {
  geral: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  nfe: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  conta: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  seguranca: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  integracoes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
};

const ticketStatusConfig: Record<TicketStatus, { label: string; className: string; icon: React.ReactNode }> = {
  open: {
    label: 'Aberto',
    icon: <CircleDotIcon className="size-3" />,
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  },
  in_progress: {
    label: 'Em andamento',
    icon: <ClockIcon className="size-3" />,
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  },
  resolved: {
    label: 'Resolvido',
    icon: <CheckCircle2Icon className="size-3" />,
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  },
  closed: {
    label: 'Encerrado',
    icon: <CheckCircle2Icon className="size-3" />,
    className: 'bg-muted text-muted-foreground border-border'
  }
};

const priorityDot: Record<TicketPriority, string> = {
  critical: 'bg-rose-600',
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-muted-foreground'
};

function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Não foi possível concluir a operação';
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function refsFromTicket(ticket: SupportTicket | undefined): TicketFiscalRef[] {
  return (ticket?.document_links ?? [])
    .filter((link) => link.document_number)
    .map((link) => ({
      number: link.document_number,
      documentId: link.fiscal_document_id ?? '',
      documentType: link.document_type
    }));
}

function FaqTab({ memberView }: { memberView: boolean }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FaqCategory | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    return faqItems.filter((item) => {
      if (!memberView && (item.category === 'nfe' || item.category === 'integracoes')) return false;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query || item.question.toLowerCase().includes(query) || item.answer.toLowerCase().includes(query);
      const matchesCategory = category === 'all' || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [search, category, memberView]);

  const filters: Array<FaqCategory | 'all'> = memberView
    ? ['all', 'geral', 'nfe', 'conta', 'seguranca', 'integracoes']
    : ['all', 'geral', 'conta', 'seguranca'];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar respostas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                category === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              )}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
              <SearchIcon className="size-10 opacity-30" />
              <p className="text-sm font-medium">Nenhuma pergunta encontrada</p>
              <p className="text-xs">Tente outro termo ou categoria</p>
            </div>
          ) : (
            items.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div key={item.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="hover:bg-muted/50 flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors"
                  >
                    <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md', categoryColors[item.category])}>
                      {categoryIcons[item.category]}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{item.question}</span>
                    <ChevronDownIcon className={cn('text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && <p className="text-muted-foreground px-4 pb-4 pl-[3.25rem] text-sm leading-relaxed">{item.answer}</p>}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MissingOrgCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organização necessária</CardTitle>
        <CardDescription>
          Os chamados ficam ligados à organização ativa. Entre pelo app da empresa para abrir ou acompanhar tickets.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function TicketsTab({
  organizationId,
  token,
  onOpen
}: {
  organizationId: string | null;
  token: string | null;
  onOpen: (ticketId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const listQuery = useQuery({
    queryKey: ['support-tickets', organizationId, page],
    queryFn: () => listSupportTickets(token!, organizationId!, { page, limit: PAGE_SIZE }),
    enabled: Boolean(token && organizationId)
  });

  if (!organizationId) return <MissingOrgCard />;

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const counts = listQuery.data?.counts ?? {};
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(['open', 'in_progress', 'resolved'] as const).map((status) => {
          const cfg = ticketStatusConfig[status];
          return (
            <Card key={status}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className={cn('flex size-9 items-center justify-center rounded-xl', cfg.className)}>{cfg.icon}</div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{counts[status] ?? 0}</p>
                  <p className="text-muted-foreground text-[11px]">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chamados</CardTitle>
          <CardDescription>Acompanhe o que já foi aberto com a equipe Nexus.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {listQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum chamado ainda.</p>
          ) : (
            items.map((ticket) => {
              const status = ticketStatusConfig[ticket.status];
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => onOpen(ticket.id)}
                  className="hover:bg-muted/40 flex w-full flex-col gap-2 rounded-lg border p-3 text-left sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{ticket.subject}</p>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {ticket.public_id}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{ticket.preview}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <span className={cn('size-1.5 rounded-full', priorityDot[ticket.priority])} />
                      {TICKET_PRIORITY_LABELS[ticket.priority]}
                    </span>
                    <Badge variant="outline" className={status.className}>
                      {status.icon}
                      {status.label}
                    </Badge>
                  </div>
                </button>
              );
            })
          )}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-muted-foreground text-xs">
                Página {page} de {pageCount} · {total} chamado(s)
              </p>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeftIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ContactTab({
  organizationId,
  token,
  documents,
  onCreated
}: {
  organizationId: string | null;
  token: string | null;
  documents: ApiFiscalDocument[];
  onCreated: (ticketId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [refs, setRefs] = useState<TicketFiscalRef[]>([]);
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [files, setFiles] = useState<File[]>([]);

  const configQuery = useQuery({
    queryKey: ['support-config', organizationId],
    queryFn: () => getSupportConfig(token!, organizationId!),
    enabled: Boolean(token && organizationId)
  });

  const priorities = configQuery.data?.allowed_priorities ?? ['medium'];

  useEffect(() => {
    if (priorities.length === 1) setPriority(priorities[0]);
  }, [priorities]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!token || !organizationId) throw new Error('Organização necessária');
      const text = ticketPlainText(html);
      if (subject.trim().length < 3) throw new ApiError({ type: '', title: '', status: 422, code: 'subject_required', detail: 'Informe o assunto', trace_id: '' });
      if (text.length < 10) throw new ApiError({ type: '', title: '', status: 422, code: 'body_required', detail: 'Descreva o problema com pelo menos 10 caracteres', trace_id: '' });
      const ticket = await createSupportTicket(token, organizationId, {
        subject: subject.trim(),
        body_html: html,
        priority,
        document_links: refs.map((ref) => ({
          document_number: ref.number,
          document_type: ref.documentType,
          ...(ref.documentId ? { fiscal_document_id: ref.documentId } : {})
        }))
      });
      for (const file of files) {
        await uploadSupportAttachment(token, organizationId, ticket.id, file);
      }
      return ticket;
    },
    onSuccess: async (ticket) => {
      toast.success('Chamado aberto', { description: ticket.public_id });
      setSubject('');
      setHtml('');
      setRefs([]);
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ['support-tickets', organizationId] });
      onCreated(ticket.id);
    },
    onError: (err) => toast.error(errorMessage(err))
  });

  if (!organizationId) return <MissingOrgCard />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailIcon className="size-4" />
              E-mail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>suporte@nexus.app</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClockIcon className="size-4" />
              Atendimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>Dias úteis, das 9h às 18h (horário de Brasília).</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRoundIcon className="size-4" />
              SLA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              {configQuery.data?.environment === 'production'
                ? 'SLA muito alto (1h) só em produção. Homologação aceita apenas prioridade média.'
                : 'Neste ambiente só é possível abrir chamado com prioridade média (48h).'}
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Abrir chamado</CardTitle>
          <CardDescription>Quanto mais detalhe, mais rápido o atendimento. Anexe arquivos e cite notas com #132.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="support-subject">Assunto</Label>
            <Input
              id="support-subject"
              placeholder="Ex.: NF-e não aparece na lista de entrada"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((item) => (
                  <SelectItem key={item} value={item}>
                    {TICKET_PRIORITY_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <TicketEditor documents={documents} onChange={(nextHtml, nextRefs) => { setHtml(nextHtml); setRefs(nextRefs); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-files">Anexos</Label>
            <Input
              id="support-files"
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-muted-foreground text-xs">{files.length} arquivo(s) selecionado(s)</p>
            )}
          </div>
          <div>
            <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              <SendIcon />
              {createMutation.isPending ? 'Enviando...' : 'Enviar chamado'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TicketDetailSheet({
  organizationId,
  token,
  ticketId,
  documents,
  onClose
}: {
  organizationId: string;
  token: string;
  ticketId: string | null;
  documents: ApiFiscalDocument[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [replyHtml, setReplyHtml] = useState('');
  const detailQuery = useQuery({
    queryKey: ['support-ticket', organizationId, ticketId],
    queryFn: () => getSupportTicket(token, organizationId, ticketId!),
    enabled: Boolean(ticketId)
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!ticketId) throw new Error('ticket');
      const text = ticketPlainText(replyHtml);
      if (text.length < 2) throw new ApiError({ type: '', title: '', status: 422, code: 'body_required', detail: 'Escreva uma resposta', trace_id: '' });
      return addSupportTicketMessage(token, organizationId, ticketId, replyHtml);
    },
    onSuccess: async () => {
      setReplyHtml('');
      await queryClient.invalidateQueries({ queryKey: ['support-ticket', organizationId, ticketId] });
      await queryClient.invalidateQueries({ queryKey: ['support-tickets', organizationId] });
      toast.success('Resposta enviada');
    },
    onError: (err) => toast.error(errorMessage(err))
  });

  const attachMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!ticketId) throw new Error('ticket');
      return uploadSupportAttachment(token, organizationId, ticketId, file);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['support-ticket', organizationId, ticketId] });
      toast.success('Anexo enviado');
    },
    onError: (err) => toast.error(errorMessage(err))
  });

  const ticket = detailQuery.data;
  const refs = refsFromTicket(ticket);
  const status = ticket ? ticketStatusConfig[ticket.status] : null;

  return (
    <Sheet open={Boolean(ticketId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{ticket?.subject ?? 'Chamado'}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {ticket && (
              <>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {ticket.public_id}
                </Badge>
                {status && (
                  <Badge variant="outline" className={status.className}>
                    {status.icon}
                    {status.label}
                  </Badge>
                )}
                <span>
                  {TICKET_PRIORITY_LABELS[ticket.priority]} · SLA até {formatWhen(ticket.sla_due_at)}
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {detailQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {(ticket?.messages ?? []).map((message) => (
                <div key={message.id} className="rounded-lg border p-3">
                  <p className="text-muted-foreground mb-2 text-xs">
                    {message.author_email} · {formatWhen(message.created_at)}
                  </p>
                  <TicketHtml html={message.body_html} refs={refs} />
                </div>
              ))}
              {(ticket?.attachments ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Anexos</p>
                  {ticket?.attachments?.map((att) => (
                    <Button
                      key={att.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void downloadSupportAttachment(token, organizationId, ticket.id, att.id).catch((err) =>
                          toast.error(errorMessage(err))
                        )
                      }
                    >
                      <PaperclipIcon />
                      {att.original_filename}
                    </Button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label>Responder</Label>
                <TicketEditor documents={documents} onChange={(html) => setReplyHtml(html)} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={replyMutation.isPending} onClick={() => replyMutation.mutate()}>
                    Enviar resposta
                  </Button>
                  <Label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <Input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) attachMutation.mutate(file);
                        e.target.value = '';
                      }}
                    />
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <PaperclipIcon className="size-3.5" /> Anexar
                    </span>
                  </Label>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function SupportPage({ initialTab = 'faq' }: { initialTab?: TabId }) {
  const role = useAuthStore((s) => s.user?.role);
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const documentsQuery = useQuery({
    queryKey: ['support-fiscal-docs', organizationId],
    queryFn: async () => {
      const [nfe, nfse] = await Promise.all([
        listFiscalDocuments(token!, organizationId!, { documentType: 'nfe', limit: 200 }).catch(() => ({ items: [] as ApiFiscalDocument[] })),
        listFiscalDocuments(token!, organizationId!, { documentType: 'nfse', limit: 200 }).catch(() => ({ items: [] as ApiFiscalDocument[] }))
      ]);
      return [...nfe.items, ...nfse.items];
    },
    enabled: Boolean(token && organizationId)
  });

  const documents = documentsQuery.data ?? [];

  const content = {
    faq: <FaqTab memberView={role !== 'admin'} />,
    tickets: (
      <TicketsTab
        organizationId={organizationId}
        token={token}
        onOpen={(id) => setOpenTicketId(id)}
      />
    ),
    contact: (
      <ContactTab
        organizationId={organizationId}
        token={token}
        documents={documents}
        onCreated={(id) => {
          setOpenTicketId(id);
          setActiveTab('tickets');
        }}
      />
    ),
    status: <StatusTab />
  }[activeTab];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Ajuda e suporte</h2>
        <p className="text-muted-foreground text-sm">
          Encontre respostas, abra chamados e acompanhe o status da plataforma
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-6 lg:flex-row">
        <SectionNav items={tabs} value={activeTab} onChange={setActiveTab} />
        <div className="min-w-0 flex-1">{content}</div>
      </div>
      {organizationId && token && (
        <TicketDetailSheet
          organizationId={organizationId}
          token={token}
          ticketId={openTicketId}
          documents={documents}
          onClose={() => setOpenTicketId(null)}
        />
      )}
    </div>
  );
}
