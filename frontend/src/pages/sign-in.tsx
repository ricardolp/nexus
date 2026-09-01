import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { postLoginPath } from '@/lib/mfa-onboarding';
import { useAuthStore } from '@/store/auth-store';
import { MfaChallengeForm } from '@/components/auth/mfa-challenge-form';
import { AuthShell } from '@/components/brand/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

export default function SignInPage() {
  const user = useAuthStore((s) => s.user);
  const pendingMfa = useAuthStore((s) => s.pendingMfaChallenge);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  const loginAsMember = useAuthStore((s) => s.loginAsMember);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberBrowser, setRememberBrowser] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user && !pendingMfa) {
    return (
      <Navigate
        to={postLoginPath({
          result: mfaSetupRequired ? 'mfa_setup' : 'ok',
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          userId: user.id,
          mfaSetupRequired
        })}
        replace
      />
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginAsMember(email, password, rememberBrowser);
      const state = useAuthStore.getState();
      if (result === 'mfa') return;
      navigate(
        postLoginPath({
          result,
          role: 'user',
          mfaEnabled: state.user?.mfaEnabled,
          userId: state.user?.id,
          mfaSetupRequired: state.mfaSetupRequired
        })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card className="w-full border-white/10 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{pendingMfa ? 'Verificação em duas etapas' : 'Entrar'}</CardTitle>
          <CardDescription>
            {pendingMfa
              ? 'Digite o código de 6 dígitos do seu autenticador'
              : 'Acesso para membros de uma organização'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingMfa ? (
            <MfaChallengeForm
              asAdmin={false}
              onSuccess={(result) => {
                const state = useAuthStore.getState();
                navigate(
                  postLoginPath({
                    result,
                    role: 'user',
                    mfaEnabled: state.user?.mfaEnabled,
                    userId: state.user?.id,
                    mfaSetupRequired: state.mfaSetupRequired
                  })
                );
              }}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <Link to="/forgot-password" className="text-muted-foreground text-xs underline-offset-4 hover:underline">
                    Esqueci a senha
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-browser"
                  checked={rememberBrowser}
                  onCheckedChange={(value) => setRememberBrowser(value === true)}
                />
                <Label htmlFor="remember-browser" className="text-sm font-normal">
                  Manter este navegador conectado
                </Label>
              </div>

              {error && (
                <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                <UserIcon />
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>

              <p className="text-muted-foreground text-center text-xs text-balance">
                Este acesso é exclusivo para membros vinculados a uma organização.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
