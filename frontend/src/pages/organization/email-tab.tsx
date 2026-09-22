import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { getEmailCredentials, testEmailCredentials, updateEmailCredentials } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

export function OrganizationEmailTab({ canEdit }: { canEdit: boolean }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['email-credentials', organizationId],
    queryFn: () => getEmailCredentials(token!, organizationId!),
    enabled: Boolean(token && organizationId)
  });

  const creds = query.data;
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [active, setActive] = useState(false);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (!creds) return;
    setHost(creds.host);
    setPort(creds.port || 587);
    setUsername(creds.username);
    setFromName(creds.from_name);
    setFromAddress(creds.from_address);
    setActive(creds.status === 'active');
  }, [creds]);

  const save = useMutation({
    mutationFn: () =>
      updateEmailCredentials(token!, organizationId!, {
        host,
        port,
        username,
        password: password ? password : undefined,
        from_name: fromName,
        from_address: fromAddress,
        status: active ? 'active' : 'disabled'
      }),
    onSuccess: () => {
      setPassword('');
      void queryClient.invalidateQueries({ queryKey: ['email-credentials', organizationId] });
      toast.success('Credenciais SMTP salvas');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  const test = useMutation({
    mutationFn: () => testEmailCredentials(token!, organizationId!, testTo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-credentials', organizationId] });
      toast.success('E-mail de teste enviado');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha no teste SMTP')
  });

  if (query.isLoading && !creds) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MailIcon className="size-4 text-primary" />
                Servidor SMTP
              </CardTitle>
              <CardDescription className="mt-1">
                Configure o envio pelo domínio da sua organização. Os e-mails fiscais saem com o remetente abaixo.
              </CardDescription>
            </div>
            <Badge variant={active ? 'default' : 'secondary'} className="shrink-0">
              {active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="smtp-host">Host</Label>
            <Input
              id="smtp-host"
              placeholder="smtp.empresa.com.br"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtp-port">Porta</Label>
            <Input
              id="smtp-port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtp-user">Usuário</Label>
            <Input
              id="smtp-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtp-pass">Senha</Label>
            <Input
              id="smtp-pass"
              type="password"
              placeholder={creds?.has_password ? '•••••••• (deixe em branco para manter)' : 'Senha SMTP'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="from-name">Nome do remetente</Label>
            <Input
              id="from-name"
              placeholder="Fiscal — Minha Empresa"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="from-address">E-mail do remetente</Label>
            <Input
              id="from-address"
              type="email"
              placeholder="fiscal@empresa.com.br"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 md:col-span-2">
            <div>
              <p className="font-medium text-sm">Enviar e-mails fiscais</p>
              <p className="text-muted-foreground text-xs">Quando inativo, mensagens ficam na caixa Nexus sem envio externo.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} disabled={!canEdit} />
          </div>
        </CardContent>
        {canEdit ? (
          <CardFooter className="border-t bg-muted/10 flex flex-wrap gap-2 justify-between">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar credenciais
            </Button>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="test-to" className="text-xs">Testar envio</Label>
                <Input
                  id="test-to"
                  type="email"
                  className="h-9 w-56"
                  placeholder="seu@email.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending || !testTo}>
                <SendIcon className="size-4" />
                Enviar teste
              </Button>
            </div>
          </CardFooter>
        ) : null}
        {creds?.last_tested_at ? (
          <p className="text-muted-foreground px-6 pb-4 text-xs">
            Último teste: {new Date(creds.last_tested_at).toLocaleString('pt-BR')}
            {creds.last_test_error ? ` — ${creds.last_test_error}` : ' — OK'}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
