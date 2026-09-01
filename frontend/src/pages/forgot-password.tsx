import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '@/lib/api';
import { forgotPassword } from '@/lib/endpoints';
import { AuthShell } from '@/components/brand/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      footer={
        <p>
          Lembrou a senha?{' '}
          <Link to="/login" className="font-medium text-white underline underline-offset-4">
            Entrar
          </Link>
        </p>
      }
    >
      <Card className="w-full border-white/10 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Esqueci a senha</CardTitle>
          <CardDescription>
            {sent
              ? 'Se o e-mail existir, enviamos um link para redefinir a senha.'
              : 'Informe o e-mail da conta para receber o link de redefinição.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Button asChild className="w-full">
              <Link to="/login">Voltar ao login</Link>
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="forgot-email">E-mail</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
