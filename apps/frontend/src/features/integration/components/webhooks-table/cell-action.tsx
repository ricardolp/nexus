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
import { deleteWebhookMutation, updateWebhookMutation } from '../../api/mutations';
import type { WebhookEndpoint } from '../../api/types';
import { ConfirmActionModal } from '@/features/organization/components/confirm-action-modal';
import { WebhookDeliveriesDialog } from '../webhook-deliveries-dialog';
import { WebhookFormSheet } from '../webhook-form-sheet';

interface WebhookCellActionProps {
  data: WebhookEndpoint;
}

export function WebhookCellAction({ data }: WebhookCellActionProps) {
  const { activeOrganizationId } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);

  const deleteMutation = useMutation({
    ...deleteWebhookMutation,
    onSuccess: () => {
      toast.success('Webhook removido');
      setDeleteOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao remover webhook');
    },
  });

  const toggleMutation = useMutation({
    ...updateWebhookMutation,
    onSuccess: () => {
      toast.success(data.active ? 'Webhook desativado' : 'Webhook ativado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar webhook');
    },
  });

  return (
    <>
      <ConfirmActionModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!activeOrganizationId) return;
          deleteMutation.mutate({
            organizationId: activeOrganizationId,
            endpointId: data.id,
          });
        }}
        loading={deleteMutation.isPending}
        title='Remover webhook?'
        description={`O endpoint ${data.url} será removido permanentemente.`}
        confirmLabel='Remover'
      />
      <WebhookFormSheet webhook={data} open={editOpen} onOpenChange={setEditOpen} />
      {activeOrganizationId && (
        <WebhookDeliveriesDialog
          organizationId={activeOrganizationId}
          webhook={data}
          open={deliveriesOpen}
          onOpenChange={setDeliveriesOpen}
        />
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>Abrir menu</span>
            <Icons.ellipsis className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Icons.edit className='mr-2 h-4 w-4' /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeliveriesOpen(true)}>
            <Icons.clock className='mr-2 h-4 w-4' /> Entregas
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (!activeOrganizationId) return;
              toggleMutation.mutate({
                organizationId: activeOrganizationId,
                endpointId: data.id,
                payload: { active: !data.active },
              });
            }}
          >
            <Icons.settings className='mr-2 h-4 w-4' />
            {data.active ? 'Desativar' : 'Ativar'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
            <Icons.trash className='mr-2 h-4 w-4' /> Remover
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
