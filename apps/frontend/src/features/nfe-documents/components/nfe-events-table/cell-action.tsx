'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconDotsVertical, IconEye, IconFileText } from '@tabler/icons-react';
import Link from 'next/link';
import type { NfeOrganizationEvent } from '../../api/types';
import { nfeDocumentDetailPath, nfeEventDetailPath } from '../../lib/paths';

export function CellAction({ data }: { data: NfeOrganizationEvent }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          onClick={(e) => e.stopPropagation()}
        >
          <IconDotsVertical className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem asChild>
          <Link href={nfeEventDetailPath(data.id)}>
            <IconEye className='mr-2 size-4' />
            Ver evento
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={nfeDocumentDetailPath(data.document.id)}>
            <IconFileText className='mr-2 size-4' />
            Ver NF-e
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
