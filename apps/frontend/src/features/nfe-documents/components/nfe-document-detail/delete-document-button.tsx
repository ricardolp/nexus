'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { deleteNfeDocumentMutation } from '../../api/mutations';
import { nfeDocumentsKeys } from '../../api/queries';

type DeleteDocumentButtonProps = {
  organizationId: string;
  documentId: string;
  documentNumber?: number;
  variant?: 'button' | 'menu-item';
  redirectOnSuccess?: boolean;
};

export function DeleteDocumentButton({
  organizationId,
  documentId,
  documentNumber,
  variant = 'button',
  redirectOnSuccess = true,
}: DeleteDocumentButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    ...deleteNfeDocumentMutation(),
    onSuccess: () => {
      toast.success('Documento eliminado. Pode importar o XML novamente.');
      void queryClient.invalidateQueries({ queryKey: nfeDocumentsKeys.all });
      setOpen(false);
      if (redirectOnSuccess) {
        router.push('/dashboard/documents/nfe');
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const label = documentNumber
    ? `Eliminar documento nº ${documentNumber}`
    : 'Eliminar documento';

  return (
    <>
      {variant === 'button' ? (
        <Button
          size='sm'
          variant='destructive'
          onClick={() => setOpen(true)}
          disabled={remove.isPending}
        >
          Eliminar documento
        </Button>
      ) : (
        <DropdownMenuItem
          className='text-destructive focus:text-destructive'
          onSelect={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          disabled={remove.isPending}
        >
          {label}
        </DropdownMenuItem>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
          </DialogHeader>
          <p className='text-muted-foreground text-sm'>
            Esta ação remove permanentemente o documento e todos os dados
            relacionados (itens, eventos, anexos XML, processo inbound,
            documentos SAP e instâncias de fluxo). Depois poderá importar o
            mesmo XML novamente.
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant='destructive'
              disabled={remove.isPending}
              onClick={() => remove.mutate({ organizationId, documentId })}
            >
              Confirmar eliminação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
