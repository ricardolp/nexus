'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { NexusLogo } from '@/components/nexus-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MicrosoftSsoButton } from './microsoft-sso-button';

export function SignUpForm() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, sobrenome, email, senha }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.message ?? 'Não foi possível criar a conta');
        return;
      }

      toast.success('Conta criada. Confirme seu e-mail para entrar.');
      router.push('/auth/sign-in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='w-full max-w-sm space-y-6'>
      <div className='flex flex-col items-center space-y-4'>
        <NexusLogo variant='square' className='h-14 w-auto lg:hidden' priority />
        <div className='space-y-2 text-center'>
          <h1 className='text-2xl font-semibold tracking-tight'>Create your account</h1>
          <p className='text-muted-foreground text-sm'>Enter your details to get started</p>
        </div>
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

      <form onSubmit={handleSubmit} className='space-y-4'>
        <div className='grid grid-cols-2 gap-3'>
          <div className='space-y-2'>
            <Label htmlFor='nome'>First name</Label>
            <Input
              id='nome'
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='sobrenome'>Last name</Label>
            <Input
              id='sobrenome'
              value={sobrenome}
              onChange={(event) => setSobrenome(event.target.value)}
              required
            />
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='signup-email'>Email address</Label>
          <Input
            id='signup-email'
            type='email'
            autoComplete='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='signup-password'>Password</Label>
          <Input
            id='signup-password'
            type='password'
            autoComplete='new-password'
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            required
          />
        </div>

        <Button type='submit' className='h-10 w-full' disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
              Creating account...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </form>

      <p className='text-muted-foreground text-center text-sm'>
        Already have an account?{' '}
        <Link href='/auth/sign-in' className='text-primary font-medium hover:underline'>
          Sign in
        </Link>
      </p>
    </div>
  );
}
