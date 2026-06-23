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
import { updateOrganizationCompanyMutation } from '../../api/mutations';
import type { OrganizationCompany } from '../../api/types';
import { CompanyFormSheet } from '../company-form-sheet';
import { CompanyCertificatesModal } from '../company-certificates-modal';
import { ConfirmActionModal } from '../confirm-action-modal';

interface CompanyCellActionProps {
  data: OrganizationCompany;
}

export function CompanyCellAction({ data }: CompanyCellActionProps) {
  const { activeOrganizationId } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [certificatesOpen, setCertificatesOpen] = useState(false);

  const blockMutation = useMutation({
    ...updateOrganizationCompanyMutation,
    onSuccess: () => {
      toast.success('Empresa bloqueada com sucesso');
      setBlockOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao bloquear empresa');
    },
  });

  const isActive = data.status === 'active';

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
            companyId: data.id,
            payload: { status: 'inactive' },
          });
        }}
        loading={blockMutation.isPending}
        title='Bloquear empresa?'
        description={`A empresa ${data.razaoSocial} ficará inativa e não poderá ser utilizada até ser reativada.`}
        confirmLabel='Bloquear'
      />
      <CompanyFormSheet company={data} open={editOpen} onOpenChange={setEditOpen} />
      {activeOrganizationId && (
        <CompanyCertificatesModal
          company={data}
          organizationId={activeOrganizationId}
          open={certificatesOpen}
          onOpenChange={setCertificatesOpen}
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
          <DropdownMenuItem onClick={() => setCertificatesOpen(true)}>
            <Icons.lock className='mr-2 h-4 w-4' /> Certificados
          </DropdownMenuItem>
          {isActive && (
            <DropdownMenuItem onClick={() => setBlockOpen(true)}>
              <Icons.lock className='mr-2 h-4 w-4' /> Bloquear
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
