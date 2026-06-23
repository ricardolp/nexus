'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { RoleFormSheet } from './role-form-sheet';

export function RoleFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> Novo perfil
      </Button>
      <RoleFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
