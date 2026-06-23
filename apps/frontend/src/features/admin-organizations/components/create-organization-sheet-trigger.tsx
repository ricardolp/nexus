'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { CreateOrganizationSheet } from './create-organization-sheet';

export function CreateOrganizationSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> Nova organização
      </Button>
      <CreateOrganizationSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
