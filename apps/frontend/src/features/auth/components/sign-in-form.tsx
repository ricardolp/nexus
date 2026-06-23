'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/auth-context';
import { MicrosoftSsoButton } from './microsoft-sso-button';

type Step = 'email' | 'password';

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = searchParams.get('redirect') ?? '/dashboard/overview';

  const handleContinue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      toast.error('Informe seu e-mail');
      return;
    }
    setStep('password');
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      toast.error('Informe sua senha');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), senha: password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.message ?? 'Não foi possível entrar');
        return;
      }

      await refreshSession();
      toast.success('Login realizado com sucesso');
      router.push(redirectTo);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='w-full max-w-sm space-y-6'>
      <div className='space-y-2 text-center'>
        <h1 className='text-2xl font-semibold tracking-tight'>Sign in to Nexus</h1>
        <p className='text-muted-foreground text-sm'>Welcome back. Please sign in to continue</p>
      </div>

      <MicrosoftSsoButton />

      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='w-full border-t' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background text-muted-foreground px-2'>or</span>
        </div>
      </div>

      {step === 'email' ? (
        <form onSubmit={handleContinue} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email'>Email address</Label>
            <Input
              id='email'
              type='email'
              autoComplete='email'
              placeholder='name@company.com'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type='submit' className='h-10 w-full'>
            Continue
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSignIn} className='space-y-4'>
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm'
            onClick={() => setStep('email')}
          >
            <Icons.chevronLeft className='h-4 w-4' />
            {email}
          </button>

          <div className='space-y-2'>
            <Label htmlFor='password'>Password</Label>
            <Input
              id='password'
              type='password'
              autoComplete='current-password'
              placeholder='Enter your password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </div>

          <Button type='submit' className='h-10 w-full' disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      )}

      <p className='text-muted-foreground text-center text-sm'>
        Don&apos;t have an account?{' '}
        <Link href='/auth/sign-up' className='text-primary font-medium hover:underline'>
          Sign up
        </Link>
      </p>
    </div>
  );
}
