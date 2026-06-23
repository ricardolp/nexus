'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';
import { useAuth } from '@/context/auth-context';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { revokeIntegrationTokenMutation } from '../../api/mutations';
import type { IntegrationToken } from '../../api/types';
import { getTokenStatus } from '../../lib/format';
import { ConfirmActionModal } from '@/features/organization/components/confirm-action-modal';

interface TokenCellActionProps {
  data: IntegrationToken;
}

export function TokenCellAction({ data }: TokenCellActionProps) {
  const { activeOrganizationId } = useAuth();
  const [revokeOpen, setRevokeOpen] = useState(false);

  const revokeMutation = useMutation({
    ...revokeIntegrationTokenMutation,
    onSuccess: () => {
      toast.success('Token revogado');
      setRevokeOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao revogar token');
    },
  });

  const status = getTokenStatus(data);
  const canRevoke = status === 'active';

  return (
    <>
      <ConfirmActionModal
        isOpen={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => {
          if (!activeOrganizationId) return;
          revokeMutation.mutate({
            organizationId: activeOrganizationId,
            tokenId: data.id,
          });
        }}
        loading={revokeMutation.isPending}
        title='Revogar token?'
        description={`O token "${data.name}" deixará de funcionar imediatamente.`}
        confirmLabel='Revogar'
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>Abrir menu</span>
            <Icons.ellipsis className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          {canRevoke && (
            <DropdownMenuItem onClick={() => setRevokeOpen(true)}>
              <Icons.trash className='mr-2 h-4 w-4' /> Revogar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
