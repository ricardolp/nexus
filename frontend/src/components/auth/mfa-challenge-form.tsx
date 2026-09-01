import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';

export function MfaChallengeForm({
  asAdmin,
  onSuccess
}: {
  asAdmin: boolean;
  onSuccess: (result: 'ok' | 'mfa_setup') => void;
}) {
  const completeMfa = useAuthStore((s) => s.completeMfa);
  const clearMfaChallenge = useAuthStore((s) => s.clearMfaChallenge);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await completeMfa(otp, asAdmin);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label>Código do autenticador</Label>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>
      {error && <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={otp.length !== 6 || loading}>
        {loading ? 'Verificando...' : 'Continuar'}
      </Button>
      <p className="text-muted-foreground text-center text-xs text-balance">
        Depois desta verificação, este navegador não pedirá o código MFA de novo por 30 dias — mesmo se você sair.
      </p>
      <Button type="button" variant="ghost" className="w-full" asChild>
        <Link to={asAdmin ? '/admin/login' : '/login'} onClick={() => clearMfaChallenge()}>
          Voltar
        </Link>
      </Button>
    </form>
  );
}
