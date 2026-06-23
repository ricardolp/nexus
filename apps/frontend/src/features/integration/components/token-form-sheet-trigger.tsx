'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { TokenFormSheet } from './token-form-sheet';

export function TokenFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> Novo token
      </Button>
      <TokenFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
