import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DownloadIcon,
  InboxIcon,
  MailIcon,
  PaperclipIcon,
  SearchIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { triggerBlobDownload } from '@/lib/api';
import {
  downloadEmailAttachment,
  getEmailMessage,
  listCompanies,
  listEmailMessages
} from '@/lib/endpoints';
import type { ApiEmailMessage, EmailMessageStatus } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const statusLabels: Record<EmailMessageStatus, { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  not_sent: { label: 'Não enviado', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  failed: { label: 'Falhou', className: 'bg-destructive/10 text-destructive' },
  rendered: { label: 'Aguardando envio', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' }
};

export default function EmailsPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: Boolean(token && organizationId)
  });

  const messagesQuery = useQuery({
    queryKey: ['email-messages', organizationId, companyFilter, statusFilter, search],
    queryFn: () =>
      listEmailMessages(token!, organizationId!, {
        company_id: companyFilter === 'all' ? undefined : companyFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        q: search || undefined,
        limit: 80
      }),
    enabled: Boolean(token && organizationId)
  });

  const detailQuery = useQuery({
    queryKey: ['email-message', organizationId, selectedId],
    queryFn: () => getEmailMessage(token!, organizationId!, selectedId!),
    enabled: Boolean(token && organizationId && selectedId)
  });

  const messages = messagesQuery.data?.items ?? [];
  const selected = detailQuery.data;

  const companyName = useMemo(() => {
    if (!selected) return '';
    return selected.company_trade_name || selected.company_legal_name || '';
  }, [selected]);

  async function handleDownload(attachmentId: string, filename: string) {
    if (!token || !organizationId || !selectedId) return;
    const { blob } = await downloadEmailAttachment(token, organizationId, selectedId, attachmentId);
    triggerBlobDownload(blob, filename);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <InboxIcon className="size-6 text-primary" />
          E-mails
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Caixa interna com o conteúdo exato que o destinatário receberia — inclusive quando o SMTP não está configurado.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Buscar por assunto ou destinatário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas empresas</SelectItem>
            {(companiesQuery.data?.items ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.trade_name || c.legal_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="sent">Enviado</SelectItem>
            <SelectItem value="not_sent">Não enviado</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
            <SelectItem value="rendered">Aguardando</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-medium">Mensagens</div>
          <div className="flex-1 overflow-y-auto">
            {messagesQuery.isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : messagesQuery.isError ? (
              <p className="text-destructive p-4 text-sm">
                {messagesQuery.error instanceof ApiError ? messagesQuery.error.message : 'Erro ao carregar'}
              </p>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                <MailIcon className="text-muted-foreground size-10 opacity-40" />
                <p className="text-muted-foreground text-sm">Nenhum e-mail fiscal registrado ainda.</p>
              </div>
            ) : (
              messages.map((m) => (
                <MessageListItem
                  key={m.id}
                  message={m}
                  active={m.id === selectedId}
                  onClick={() => setSelectedId(m.id)}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <MailIcon className="text-muted-foreground size-12 opacity-30" />
              <p className="text-muted-foreground text-sm">Selecione um e-mail para visualizar</p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : selected ? (
            <>
              <div className="border-b bg-muted/20 px-6 py-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-semibold text-lg leading-snug">{selected.subject}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="text-muted-foreground grid gap-1 text-sm">
                  <p><span className="text-foreground font-medium">De:</span> {selected.from_name} &lt;{selected.from_address}&gt;</p>
                  <p><span className="text-foreground font-medium">Para:</span> {selected.to_addresses.join(', ')}</p>
                  {selected.cc_addresses?.length ? (
                    <p><span className="text-foreground font-medium">CC:</span> {selected.cc_addresses.join(', ')}</p>
                  ) : null}
                  <p>
                    <span className="text-foreground font-medium">Empresa:</span> {companyName}
                    · {selected.process_label}
                  </p>
                  <p>
                    {format(new Date(selected.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                    {selected.sent_at ? ` · Enviado ${format(new Date(selected.sent_at), 'HH:mm', { locale: ptBR })}` : ''}
                  </p>
                  {selected.last_error ? (
                    <p className="text-destructive text-xs">{selected.last_error}</p>
                  ) : null}
                </div>
                {selected.attachments?.length ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selected.attachments.map((att) => (
                      <Button
                        key={att.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        disabled={!att.available}
                        onClick={() => handleDownload(att.id, att.filename)}
                      >
                        <PaperclipIcon className="size-3.5" />
                        {att.filename || att.kind}
                        {!att.available ? ' (pendente)' : null}
                        {att.available ? <DownloadIcon className="size-3.5" /> : null}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex-1 overflow-y-auto bg-white p-6 dark:bg-zinc-950">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none email-body-preview"
                  dangerouslySetInnerHTML={{ __html: selected.body_html }}
                />
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function MessageListItem({
  message,
  active,
  onClick
}: {
  message: ApiEmailMessage;
  active: boolean;
  onClick: () => void;
}) {
  const company = message.company_trade_name || message.company_legal_name;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
        active && 'bg-primary/5 border-l-2 border-l-primary'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm line-clamp-1">{message.subject || '(sem assunto)'}</p>
        <StatusBadge status={message.status} compact />
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs line-clamp-1">
        Para: {message.to_addresses.join(', ')}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        {company} · {format(new Date(message.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
      </p>
    </button>
  );
}

function StatusBadge({ status, compact }: { status: EmailMessageStatus; compact?: boolean }) {
  const cfg = statusLabels[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={cn('shrink-0 border-0', cfg.className, compact && 'text-[10px] px-1.5 py-0')}>
      {cfg.label}
    </Badge>
  );
}
