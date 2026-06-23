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
import { removeOrganizationMemberMutation } from '../../api/mutations';
import type { OrganizationMember } from '../../api/types';
import { ConfirmActionModal } from '../confirm-action-modal';

interface MemberCellActionProps {
  data: OrganizationMember;
}

export function MemberCellAction({ data }: MemberCellActionProps) {
  const { activeOrganizationId } = useAuth();
  const [blockOpen, setBlockOpen] = useState(false);

  const blockMutation = useMutation({
    ...removeOrganizationMemberMutation,
    onSuccess: () => {
      toast.success('Usuário bloqueado na organização');
      setBlockOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao bloquear usuário');
    },
  });

  return (
    <>
      <ConfirmActionModal
        isOpen={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={() => {
          if (!activeOrganizationId) {
            return;
          }
          blockMutation.mutate({
            organizationId: activeOrganizationId,
            memberId: data.id,
          });
        }}
        loading={blockMutation.isPending}
        title='Bloquear usuário?'
        description={`O usuário ${data.user.nome} ${data.user.sobrenome} perderá o acesso à organização. Esta ação pode ser revertida adicionando o membro novamente.`}
        confirmLabel='Bloquear'
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
          <DropdownMenuItem onClick={() => setBlockOpen(true)}>
            <Icons.lock className='mr-2 h-4 w-4' /> Bloquear
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
