'use client';

import { Button } from '@/components/ui/button';

function MicrosoftIcon() {
  return (
    <svg aria-hidden='true' viewBox='0 0 21 21' className='mr-2 h-4 w-4'>
      <rect x='1' y='1' width='9' height='9' fill='#f25022' />
      <rect x='11' y='1' width='9' height='9' fill='#7fba00' />
      <rect x='1' y='11' width='9' height='9' fill='#00a4ef' />
      <rect x='11' y='11' width='9' height='9' fill='#ffb900' />
    </svg>
  );
}

export function MicrosoftSsoButton() {
  const handleClick = () => {
    window.location.href = '/api/auth/microsoft';
  };

  return (
    <Button type='button' variant='outline' className='h-10 w-full' onClick={handleClick}>
      <MicrosoftIcon />
      Continue with Microsoft
    </Button>
  );
}
