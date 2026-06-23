'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { MemberUserFormSheet } from './member-user-form-sheet';

export function MemberUserFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> Novo usuário
      </Button>
      <MemberUserFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
