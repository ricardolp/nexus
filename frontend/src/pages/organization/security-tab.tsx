import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { getAuthSettings, updateAuthSettings } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FieldRow } from './field-row';
import { passwordComplexityLabel, sessionTimeoutLabel } from './helpers';

export function OrganizationSecurityTab({ canEdit }: { canEdit: boolean }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['auth-settings', organizationId],
    queryFn: () => getAuthSettings(token!, organizationId!),
    enabled: Boolean(token && organizationId)
  });

  const settings = query.data;
  const [minLength, setMinLength] = useState(12);
  const [maxLength, setMaxLength] = useState(128);
  const [requireUppercase, setRequireUppercase] = useState(false);
  const [requireLowercase, setRequireLowercase] = useState(false);
  const [requireNumber, setRequireNumber] = useState(false);
  const [requireSpecial, setRequireSpecial] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [idle, setIdle] = useState(30);
  const [absolute, setAbsolute] = useState(480);
  const [locked, setLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');

  useEffect(() => {
    if (!settings) return;
    setMinLength(settings.min_password_length);
    setMaxLength(settings.max_password_length);
    setRequireUppercase(settings.require_uppercase);
    setRequireLowercase(settings.require_lowercase);
    setRequireNumber(settings.require_number);
    setRequireSpecial(settings.require_special);
    setMfaRequired(settings.mfa_required);
    setIdle(settings.session_idle_timeout_minutes);
    setAbsolute(settings.session_absolute_timeout_minutes);
    setLocked(settings.access_locked);
    setLockMessage(settings.access_lock_message ?? '');
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      updateAuthSettings(token!, organizationId!, {
        min_password_length: minLength,
        max_password_length: maxLength,
        require_uppercase: requireUppercase,
        require_lowercase: requireLowercase,
        require_number: requireNumber,
        require_special: requireSpecial,
        mfa_required: mfaRequired,
        access_locked: locked,
        access_lock_message: lockMessage,
        session_idle_timeout_minutes: idle,
        session_absolute_timeout_minutes: absolute
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-settings', organizationId] });
      toast.success('Políticas atualizadas');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  if (query.isLoading && !settings) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!settings) {
    return (
      <p className="text-muted-foreground py-2 text-sm">Não foi possível carregar as políticas de segurança.</p>
    );
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Segurança e acesso</CardTitle>
          <CardDescription>Regras aplicadas a todos os membros desta organização.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldRow
            label="Exigir autenticação em dois fatores"
            value={
              settings.mfa_required
                ? 'Todos os membros precisam ativar o 2FA para acessar a organização'
                : 'Opcional para cada membro'
            }
          />
          <FieldRow label="Complexidade da senha" value={passwordComplexityLabel(settings)} />
          <FieldRow
            label="Timeout de sessão"
            value={sessionTimeoutLabel(settings.session_absolute_timeout_minutes)}
          />
          <FieldRow
            label="Inatividade"
            value={`${settings.session_idle_timeout_minutes} minutos`}
          />
          <FieldRow
            label="Bloqueio por manutenção"
            value={settings.access_locked ? (settings.access_lock_message || 'Acesso bloqueado') : 'Desligado'}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Política de senha</CardTitle>
          <CardDescription>Vale para convite, troca e redefinição de senha.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Tamanho mínimo</Label>
            <Input type="number" min={8} max={128} value={minLength} onChange={(e) => setMinLength(Number(e.target.value))} />
          </div>
          <div className="grid gap-2">
            <Label>Tamanho máximo</Label>
            <Input type="number" min={8} max={128} value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} />
          </div>
          <div className="flex items-center justify-between sm:col-span-2">
            <Label>Exigir letra maiúscula</Label>
            <Switch checked={requireUppercase} onCheckedChange={setRequireUppercase} />
          </div>
          <div className="flex items-center justify-between sm:col-span-2">
            <Label>Exigir letra minúscula</Label>
            <Switch checked={requireLowercase} onCheckedChange={setRequireLowercase} />
          </div>
          <div className="flex items-center justify-between sm:col-span-2">
            <Label>Exigir número</Label>
            <Switch checked={requireNumber} onCheckedChange={setRequireNumber} />
          </div>
          <div className="flex items-center justify-between sm:col-span-2">
            <Label>Exigir caractere especial</Label>
            <Switch checked={requireSpecial} onCheckedChange={setRequireSpecial} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autenticação em dois fatores</CardTitle>
          <CardDescription>
            Se estiver ligado, cada membro precisa concluir o onboarding de 2FA no primeiro acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm">2FA obrigatório para membros</p>
          <Switch checked={mfaRequired} onCheckedChange={setMfaRequired} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessões</CardTitle>
          <CardDescription>Tempo ocioso e duração máxima da sessão humana.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Inatividade (minutos)</Label>
            <Input type="number" min={5} value={idle} onChange={(e) => setIdle(Number(e.target.value))} />
          </div>
          <div className="grid gap-2">
            <Label>Duração absoluta (minutos)</Label>
            <Input type="number" min={15} value={absolute} onChange={(e) => setAbsolute(Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bloqueio por manutenção</CardTitle>
          <CardDescription>
            Impede login humano. Integrações e API de NF-e continuam. Administradores da organização ainda entram para desbloquear.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm">Bloquear acesso ao sistema</p>
            <Switch checked={locked} onCheckedChange={setLocked} />
          </div>
          {locked && (
            <div className="grid gap-2">
              <Label>Mensagem exibida no login</Label>
              <Textarea
                value={lockMessage}
                onChange={(e) => setLockMessage(e.target.value)}
                placeholder="Sistema em manutenção. Tente novamente em breve."
              />
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || query.isLoading}>
            {save.isPending ? 'Salvando...' : 'Salvar políticas'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
