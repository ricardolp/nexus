import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CopyIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { confirmMfa, enrollMfa } from '@/lib/endpoints';
import { markMfaOnboardingDone, markMfaOnboardingSkipped } from '@/lib/mfa-onboarding';
import { useAuthStore } from '@/store/auth-store';
import { AuthShell } from '@/components/brand/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Progress } from '@/components/ui/progress';

type Step = 'intro' | 'scan' | 'codes';

export default function MfaOnboardingPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  const completeMfaSetup = useAuthStore((s) => s.completeMfaSetup);
  const applySession = useAuthStore((s) => s.applySession);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('intro');
  const [enroll, setEnroll] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const home = user?.role === 'admin' ? '/admin/overview' : '/app/overview';

  useEffect(() => {
    if (step === 'intro' && user?.mfaEnabled && !mfaSetupRequired) {
      navigate(home, { replace: true });
    }
  }, [user, mfaSetupRequired, home, navigate, step]);

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  function goHome() {
    markMfaOnboardingDone(user!.id);
    completeMfaSetup();
    navigate(home, { replace: true });
  }

  async function startEnroll() {
    setError(null);
    setLoading(true);
    try {
      const result = await enrollMfa(token!);
      setEnroll(result);
      setStep('scan');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível iniciar o 2FA.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode() {
    if (otp.length !== 6 || !token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await confirmMfa(token, otp);
      setCodes(res.recovery_codes);
      if (res.user) setUserProfile(res.user);
      if (res.user) {
        await applySession(
          {
            user: res.user,
            organization_id: res.organization_id,
            mfa_setup_required: false
          },
          user!.role
        );
      }
      completeMfaSetup();
      setStep('codes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const progress = step === 'intro' ? 30 : step === 'scan' ? 65 : 100;

  return (
    <AuthShell wide>
      <Card className="w-full border-white/10 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <CardHeader className="text-center">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Passo {step === 'intro' ? 1 : step === 'scan' ? 2 : 3} de 3</p>
          <Progress value={progress} className="mt-2" />
          <CardTitle className="mt-4 text-xl">
            {step === 'intro' && 'Proteja sua conta'}
            {step === 'scan' && 'Escaneie o QR Code'}
            {step === 'codes' && 'Guarde os códigos de recuperação'}
          </CardTitle>
          <CardDescription>
            {step === 'intro' &&
              (mfaSetupRequired
                ? 'Sua organização exige autenticação em dois fatores antes de continuar.'
                : 'No primeiro acesso, configure o 2FA para que só você entre nesta conta.')}
            {step === 'scan' && 'Abra o Google Authenticator, 1Password ou Authy e aponte a câmera para o código.'}
            {step === 'codes' && 'Cada código vale uma vez. Salve em um lugar seguro — você não verá esta lista de novo.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 'intro' && (
            <>
              <ul className="text-muted-foreground space-y-2 text-sm">
                <li className="flex gap-2">
                  <SmartphoneIcon className="mt-0.5 size-4 shrink-0" />
                  Você vai usar um app autenticador no celular.
                </li>
                <li className="flex gap-2">
                  <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
                  Depois da senha, o app gera um código de 6 dígitos a cada 30 segundos.
                </li>
              </ul>
              {error && (
                <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
              )}
              <Button className="w-full" onClick={() => void startEnroll()} disabled={loading}>
                {loading ? 'Preparando...' : 'Começar'}
              </Button>
              {!mfaSetupRequired && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    markMfaOnboardingSkipped(user.id);
                    navigate(home, { replace: true });
                  }}
                >
                  Fazer depois
                </Button>
              )}
            </>
          )}

          {step === 'scan' && enroll && (
            <>
              <img
                alt="QR Code para autenticador"
                className="mx-auto size-44 rounded-md bg-white p-2"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(enroll.otpauth_url)}`}
              />
              <p className="text-muted-foreground text-center text-xs">
                Não consegue escanear? Digite o segredo no app:
                <br />
                <code className="text-foreground break-all">{enroll.secret}</code>
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
              )}
              <Button className="w-full" disabled={otp.length !== 6 || loading} onClick={() => void confirmCode()}>
                {loading ? 'Verificando...' : 'Confirmar código'}
              </Button>
            </>
          )}

          {step === 'codes' && (
            <>
              <div className="bg-muted grid grid-cols-2 gap-2 rounded-md p-3 font-mono text-sm">
                {codes.map((code) => (
                  <div key={code}>{code}</div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  void navigator.clipboard.writeText(codes.join('\n'));
                  setCopied(true);
                  toast.success('Códigos copiados');
                }}
              >
                <CopyIcon />
                {copied ? 'Copiado' : 'Copiar códigos'}
              </Button>
              <Button className="w-full" onClick={goHome}>
                Já salvei, entrar no Nexus
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
