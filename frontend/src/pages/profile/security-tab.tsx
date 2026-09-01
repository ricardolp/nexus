import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangleIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  KeyRoundIcon,
  ShieldAlertIcon,
  ShieldCheckIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  changePassword,
  confirmMfa,
  disableMfa,
  enrollMfa,
  getMfaStatus,
  getMyPasswordPolicy,
  listSecurityEvents,
  listSessions,
  regenerateRecoveryCodes
} from '@/lib/endpoints';
import type { ApiSecurityEvent } from '@/lib/api-types';
import { formatRelativeTime } from '@/pages/app/fiscal/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  copyText,
  downloadCsv,
  eventMeta,
  parseUserAgent,
  type EventSeverity
} from './helpers';
import { ProfileSessionManager } from './session-manager';

const alertFilters: { id: 'all' | EventSeverity; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'critical', label: 'Crítico' },
  { id: 'warning', label: 'Atenção' },
  { id: 'info', label: 'Info' }
];

function severityOf(event: ApiSecurityEvent): EventSeverity {
  if (event.outcome !== 'success') return 'critical';
  return eventMeta(event.event_type).severity;
}

export function ProfileSecurityTab({
  token,
  passwordChangedAt
}: {
  token: string;
  passwordChangedAt?: string | null;
}) {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({ queryKey: ['password-policy'], queryFn: () => getMyPasswordPolicy(token) });
  const mfaQuery = useQuery({ queryKey: ['mfa-status'], queryFn: () => getMfaStatus(token) });
  const sessionsQuery = useQuery({ queryKey: ['sessions'], queryFn: () => listSessions(token) });
  const eventsQuery = useQuery({ queryKey: ['security-events'], queryFn: () => listSecurityEvents(token) });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [enroll, setEnroll] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [alertFilter, setAlertFilter] = useState<(typeof alertFilters)[number]['id']>('all');

  const policy = policyQuery.data;
  const passwordHint = policy
    ? `Mínimo ${policy.min_length} caracteres${policy.require_uppercase ? ', maiúscula' : ''}${policy.require_number ? ', número' : ''}${policy.require_special ? ', especial' : ''}.`
    : 'Mínimo 12 caracteres.';

  const sessions = sessionsQuery.data?.items ?? [];
  const events = eventsQuery.data?.items ?? [];
  const alerts = useMemo(
    () =>
      events.filter((event) => {
        const severity = severityOf(event);
        return alertFilter === 'all' || severity === alertFilter;
      }),
    [events, alertFilter]
  );
  const counts = useMemo(() => {
    const all = events.length;
    const critical = events.filter((e) => severityOf(e) === 'critical').length;
    const warning = events.filter((e) => severityOf(e) === 'warning').length;
    const info = events.filter((e) => severityOf(e) === 'info').length;
    return { all, critical, warning, info };
  }, [events]);

  const changePwd = useMutation({
    mutationFn: () =>
      changePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
        revoke_other_sessions: revokeOthers
      }),
    onSuccess: () => {
      toast.success('Senha atualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['security-events'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha')
  });

  function saveRecoveryFile(codes: string[]) {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'codigos-recuperacao-nexus.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Alterar senha</CardTitle>
              <CardDescription>{passwordHint}</CardDescription>
            </div>
            <p className="text-muted-foreground text-xs">
              {passwordChangedAt ? `Alterada ${formatRelativeTime(passwordChangedAt)}` : 'Nunca alterada neste registro'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-1">
              <Label>Senha atual</Label>
              <PasswordInput autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Nova senha</Label>
              <PasswordInput autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Confirmar nova senha</Label>
              <PasswordInput autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-destructive text-sm">As senhas não coincidem.</p>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={revokeOthers} onCheckedChange={(value) => setRevokeOthers(value === true)} className="mt-0.5" />
            Encerrar todas as outras sessões depois de alterar a senha
          </label>
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button
            disabled={changePwd.isPending || newPassword !== confirmPassword || !newPassword || !currentPassword}
            onClick={() => changePwd.mutate()}
          >
            <KeyRoundIcon />
            Atualizar senha
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autenticação em dois fatores</CardTitle>
          <CardDescription>
            {mfaQuery.data?.enabled
              ? '2FA está ativo nesta conta.'
              : 'Use um app autenticador (Google Authenticator, 1Password, Authy).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!mfaQuery.data?.enabled && !enroll && (
            <Button
              type="button"
              onClick={() =>
                enrollMfa(token)
                  .then(setEnroll)
                  .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao iniciar 2FA'))
              }
            >
              <ShieldCheckIcon />
              Ativar 2FA
            </Button>
          )}
          {enroll && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <img
                alt="QR Code 2FA"
                className="bg-white size-44 rounded-md p-2"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(enroll.otpauth_url)}`}
              />
              <div className="flex flex-1 flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Segredo:{' '}
                  <code className="text-foreground break-all">{enroll.secret}</code>
                </p>
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  disabled={otp.length !== 6}
                  onClick={() =>
                    confirmMfa(token, otp)
                      .then((res) => {
                        setRecoveryCodes(res.recovery_codes);
                        setEnroll(null);
                        void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
                        void queryClient.invalidateQueries({ queryKey: ['me'] });
                        void queryClient.invalidateQueries({ queryKey: ['security-events'] });
                        toast.success('2FA ativado');
                      })
                      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Código inválido'))
                  }
                >
                  Confirmar
                </Button>
              </div>
            </div>
          )}
          {recoveryCodes && (
            <div className="bg-muted rounded-xl p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Guarde estes códigos de recuperação</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyText(recoveryCodes.join('\n'))}>
                    <CopyIcon />
                    Copiar
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => saveRecoveryFile(recoveryCodes)}>
                    <DownloadIcon />
                    Baixar
                  </Button>
                </div>
              </div>
              <div className="grid gap-1 font-mono text-sm sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <div key={code} className="rounded-md bg-background px-2 py-1">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}
          {mfaQuery.data?.enabled && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Senha atual para desativar</Label>
                  <PasswordInput value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Código 2FA</Label>
                  <Input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    regenerateRecoveryCodes(token, disablePassword)
                      .then((res) => setRecoveryCodes(res.recovery_codes))
                      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Falha'))
                  }
                >
                  Regenerar códigos
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    disableMfa(token, disablePassword, disableCode)
                      .then(() => {
                        void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
                        void queryClient.invalidateQueries({ queryKey: ['me'] });
                        void queryClient.invalidateQueries({ queryKey: ['security-events'] });
                        toast.success('2FA desativado');
                      })
                      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Falha'))
                  }
                >
                  Desativar 2FA
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ProfileSessionManager token={token} sessions={sessions} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Alertas de segurança</CardTitle>
              <CardDescription>Eventos que pedem a sua atenção.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{counts.all}</Badge>
              {counts.critical > 0 && <Badge variant="destructive">{counts.critical} críticos</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1">
            {alertFilters.map((item) => {
              const count =
                item.id === 'all' ? counts.all : item.id === 'critical' ? counts.critical : item.id === 'warning' ? counts.warning : counts.info;
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={alertFilter === item.id ? 'secondary' : 'ghost'}
                  onClick={() => setAlertFilter(item.id)}
                >
                  {item.label}
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </Button>
              );
            })}
          </div>
          <ul className="flex flex-col gap-2">
            {alerts.map((event) => {
              const severity = severityOf(event);
              const meta = eventMeta(event.event_type);
              const parsed = parseUserAgent(event.user_agent);
              const Icon =
                severity === 'critical' ? ShieldAlertIcon : severity === 'warning' ? AlertTriangleIcon : InfoIcon;
              return (
                <li
                  key={event.id}
                  className={cn(
                    'rounded-lg border px-3 py-3',
                    severity === 'critical' && 'border-l-destructive border-l-4',
                    severity === 'warning' && 'border-l-amber-500 border-l-4',
                    severity === 'info' && 'border-l-primary border-l-4'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        severity === 'critical' && 'text-destructive',
                        severity === 'warning' && 'text-amber-500',
                        severity === 'info' && 'text-primary'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{meta.title}</p>
                        <Badge
                          variant={severity === 'critical' ? 'destructive' : severity === 'warning' ? 'outline' : 'secondary'}
                        >
                          {severity === 'critical' ? 'Crítico' : severity === 'warning' ? 'Atenção' : 'Info'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm">{meta.description}</p>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {formatRelativeTime(event.occurred_at)} · {event.ip_address ?? '0.0.0.0'} · {parsed.device}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
            {alerts.length === 0 && <p className="text-muted-foreground text-sm">Nenhum alerta nesta categoria.</p>}
          </ul>
          {events.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                downloadCsv('alertas-seguranca.csv', [
                  ['Data', 'Severidade', 'Evento', 'IP', 'Dispositivo'],
                  ...alerts.map((event) => [
                    event.occurred_at,
                    severityOf(event),
                    eventMeta(event.event_type).title,
                    event.ip_address ?? '',
                    parseUserAgent(event.user_agent).device
                  ])
                ])
              }
            >
              <DownloadIcon />
              Exportar alertas
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
