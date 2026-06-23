'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { CompanyFormSheet } from './company-form-sheet';

export function CompanyFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> Nova empresa
      </Button>
      <CompanyFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
