'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconDotsVertical, IconEye, IconRefresh } from '@tabler/icons-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { reprocessInboundMutation } from '../../api/mutations';
import { nfeDocumentsKeys } from '../../api/queries';
import type { NfeDocumentListItem } from '../../api/types';
import { nfeDocumentDetailPath } from '../../lib/paths';
import { DeleteDocumentButton } from '../nfe-document-detail/delete-document-button';

export function CellAction({ data }: { data: NfeDocumentListItem }) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const reprocess = useMutation({
    ...reprocessInboundMutation(),
    onSuccess: () => {
      toast.success('Reprocessamento iniciado');
      if (activeOrganizationId) {
        void queryClient.invalidateQueries({
          queryKey: nfeDocumentsKeys.all,
        });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='size-8' onClick={(e) => e.stopPropagation()}>
          <IconDotsVertical className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem asChild>
          <Link href={nfeDocumentDetailPath(data.id)}>
            <IconEye className='mr-2 size-4' />
            Ver detalhe
          </Link>
        </DropdownMenuItem>
        {data.direction === 'inbound' && activeOrganizationId && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              reprocess.mutate({
                organizationId: activeOrganizationId,
                documentId: data.id,
              });
            }}
          >
            <IconRefresh className='mr-2 size-4' />
            Reprocessar
          </DropdownMenuItem>
        )}
        {activeOrganizationId && (
          <>
            <DropdownMenuSeparator />
            <DeleteDocumentButton
              organizationId={activeOrganizationId}
              documentId={data.id}
              documentNumber={data.number}
              variant='menu-item'
              redirectOnSuccess={false}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
