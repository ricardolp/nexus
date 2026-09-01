import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { acceptInvitation, getInvitationPasswordPolicy } from '@/lib/endpoints';
import { AuthShell } from '@/components/brand/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';

export default function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedRole, setAcceptedRole] = useState<string | null>(null);
  const policyQuery = useQuery({
    queryKey: ['invite-password-policy', token],
    queryFn: () => getInvitationPasswordPolicy(token),
    enabled: Boolean(token)
  });
  const minLength = policyQuery.data?.min_length ?? 12;

  const loginPath = acceptedRole === 'member' ? '/login' : '/admin/login';

  if (!token) {
    return (
      <AuthShell
        footer={
          <p>
            Já tem conta?{' '}
            <Link to="/login" className="font-medium text-white underline underline-offset-4">
              Entrar
            </Link>
          </p>
        }
      >
        <Card className="w-full border-white/10 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Convite inválido</CardTitle>
            <CardDescription>Este link não contém um token de convite.</CardDescription>
          </CardHeader>
        </Card>
      </AuthShell>
    );
  }

  if (acceptedRole) {
    return (
      <AuthShell>
        <Card className="w-full border-white/10 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Conta ativada</CardTitle>
            <CardDescription>Sua senha foi definida. Entre para continuar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to={loginPath}>Entrar</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < minLength) {
      setError(`A senha deve ter pelo menos ${minLength} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const user = await acceptInvitation(token, password);
      setAcceptedRole(user.platform_role);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível ativar o convite. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      footer={
        <p>
          Já ativou sua conta?{' '}
          <Link to="/login" className="font-medium text-white underline underline-offset-4">
            Entrar
          </Link>
        </p>
      }
    >
      <Card className="w-full border-white/10 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Ativar convite</CardTitle>
          <CardDescription>Crie uma senha para concluir o acesso ao Nexus</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-password">Senha</Label>
              <PasswordInput
                id="invite-password"
                placeholder={`mínimo ${minLength} caracteres`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={minLength}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-confirm">Confirmar senha</Label>
              <PasswordInput
                id="invite-confirm"
                placeholder="repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={minLength}
                required
              />
            </div>

            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              <KeyRoundIcon />
              {loading ? 'Ativando...' : 'Ativar conta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
