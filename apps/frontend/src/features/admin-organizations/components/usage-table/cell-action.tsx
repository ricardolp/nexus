'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { OrganizationUsageSummaryItem } from '../../api/types';
import { OrganizationUsageSheet } from '../organization-usage-sheet';
import { useState } from 'react';

interface UsageCellActionProps {
  data: OrganizationUsageSummaryItem;
}

export function UsageCellAction({ data }: UsageCellActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <OrganizationUsageSheet
        organization={{
          id: data.organizationId,
          nome: data.nome,
          slug: data.slug,
          logo: null,
        }}
        open={open}
        onOpenChange={setOpen}
      />
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        <Icons.trendingUp className='mr-2 h-4 w-4' />
        Detalhes
      </Button>
    </>
  );
}
