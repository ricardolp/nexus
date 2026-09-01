import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangleIcon,
  LaptopIcon,
  LogOutIcon,
  MonitorIcon,
  ShieldIcon,
  SmartphoneIcon,
  TabletIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { revokeOtherSessions, revokeSession } from '@/lib/endpoints';
import type { ApiSession } from '@/lib/api-types';
import { formatRelativeTime } from '@/pages/app/fiscal/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseUserAgent, sessionDeviceName, type DeviceKind } from './helpers';

type ConfirmState = { type: 'one'; session: ApiSession } | { type: 'others' } | null;

function DeviceIcon({ kind, current }: { kind: DeviceKind; current: boolean }) {
  const Icon =
    kind === 'phone' ? SmartphoneIcon : kind === 'tablet' ? TabletIcon : kind === 'desktop' ? MonitorIcon : LaptopIcon;
  return (
    <div
      className={cn(
        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
        current ? 'bg-emerald-500/10' : 'bg-muted/50'
      )}
    >
      <Icon className={cn('size-4', current ? 'text-emerald-600' : 'text-muted-foreground')} />
    </div>
  );
}

function formatStarted(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function lastActiveLabel(session: ApiSession) {
  if (session.current) return 'Ativo agora';
  const seen = new Date(session.last_seen_at).getTime();
  if (Number.isFinite(seen) && Date.now() - seen < 2 * 60_000) return 'Ativo agora';
  return formatRelativeTime(session.last_seen_at);
}

export function ProfileSessionManager({
  token,
  sessions
}: {
  token: string;
  sessions: ApiSession[];
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const active = sessions.filter((session) => !session.revoked_at);
  const others = active.filter((session) => !session.current);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['security-events'] });
  }

  const revokeOne = useMutation({
    mutationFn: (sessionId: string) => revokeSession(token, sessionId),
    onSuccess: () => {
      toast.success('Sessão encerrada');
      setConfirm(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível encerrar a sessão')
  });

  const revokeOthers = useMutation({
    mutationFn: () => revokeOtherSessions(token),
    onSuccess: (res) => {
      toast.success(res.revoked === 1 ? '1 sessão encerrada' : `${res.revoked} sessões encerradas`);
      setConfirm(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível encerrar as sessões')
  });

  const pending = revokeOne.isPending || revokeOthers.isPending;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Sessões ativas</h2>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                {active.length}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">Dispositivos atualmente conectados à sua conta</p>
          </div>
          {others.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangleIcon className="size-3" />
              {others.length} {others.length === 1 ? 'outra' : 'outras'}
            </span>
          )}
        </div>
        <div className="bg-muted/50 mt-2 flex items-start gap-2 rounded-md px-3 py-2">
          <ShieldIcon className="text-muted-foreground mt-0.5 size-3 shrink-0" />
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Se não reconhecer uma sessão, encerre-a imediatamente e altere a senha.
          </p>
        </div>
      </div>

      {active.length === 0 && (
        <p className="text-muted-foreground px-4 py-6 text-sm">Nenhuma sessão ativa.</p>
      )}

      <div>
        {active.map((session) => {
          const parsed = parseUserAgent(session.user_agent);
          return (
            <div
              key={session.id}
              className={cn('border-b px-4 py-3 last:border-b-0', session.current && 'bg-muted/20')}
            >
            <div className="flex items-start gap-3">
              <DeviceIcon kind={parsed.kind} current={session.current} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{sessionDeviceName(session)}</span>
                  {session.current && (
                    <Badge
                      variant="secondary"
                      className="h-4 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600"
                    >
                      Sessão atual
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span>
                    {parsed.browserDetail}
                    {parsed.osDetail !== '—' ? ` no ${parsed.osDetail}` : ''}
                  </span>
                  <span>{lastActiveLabel(session)}</span>
                  <span className="font-mono text-[11px]">{session.ip_address ?? 'IP desconhecido'}</span>
                </div>
                <p className="text-muted-foreground mt-1 text-[10px]">Iniciada em {formatStarted(session.created_at)}</p>
              </div>
              {!session.current && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive h-7 shrink-0 gap-1 text-xs"
                  onClick={() => setConfirm({ type: 'one', session })}
                >
                  <LogOutIcon className="size-3" />
                  Encerrar
                </Button>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {others.length > 0 && (
        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-[10px]">
              <span className="tabular-nums">{others.length}</span>{' '}
              {others.length === 1 ? 'outra sessão além deste dispositivo' : 'outras sessões além deste dispositivo'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive h-7 gap-1.5 text-xs"
              onClick={() => setConfirm({ type: 'others' })}
            >
              <LogOutIcon className="size-3" />
              Encerrar as outras sessões
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.type === 'others' ? 'Encerrar as outras sessões?' : 'Encerrar esta sessão?'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.type === 'one'
                ? `${sessionDeviceName(confirm.session)} perderá o acesso até que alguém entre de novo.`
                : 'Os demais dispositivos precisarão entrar novamente.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (confirm?.type === 'others') revokeOthers.mutate();
                else if (confirm?.type === 'one') revokeOne.mutate(confirm.session.id);
              }}
            >
              {pending ? 'Encerrando...' : 'Encerrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
