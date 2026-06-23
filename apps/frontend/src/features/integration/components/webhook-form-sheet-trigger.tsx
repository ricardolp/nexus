'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { WebhookFormSheet } from './webhook-form-sheet';

export function WebhookFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> Novo webhook
      </Button>
      <WebhookFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
