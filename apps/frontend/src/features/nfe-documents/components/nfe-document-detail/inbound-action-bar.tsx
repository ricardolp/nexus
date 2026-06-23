'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  confirmPortariaMutation,
  registerMigoMutation,
  rejectInboundMutation,
  reprocessInboundMutation,
  resetInboundMutation,
  retrySapStepMutation,
} from '../../api/mutations';
import { nfeDocumentsKeys } from '../../api/queries';
import type { NfeInboundProcess, SapRetryStep } from '../../api/types';
import {
  canResetInboundStatus,
  isTerminalInboundStatus,
} from '../../lib/build-inbound-steps';
import { IconDotsVertical, IconRefresh } from '@tabler/icons-react';
import { DeleteDocumentButton } from './delete-document-button';

type InboundActionBarProps = {
  organizationId: string;
  documentId: string;
  inbound: NfeInboundProcess;
};

export function InboundActionBar({
  organizationId,
  documentId,
  inbound,
}: InboundActionBarProps) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: nfeDocumentsKeys.detail(organizationId, documentId),
    });
    void queryClient.invalidateQueries({
      queryKey: nfeDocumentsKeys.inbound(organizationId, documentId),
    });
    void queryClient.invalidateQueries({
      queryKey: nfeDocumentsKeys.sapDocuments(organizationId, documentId),
    });
    void queryClient.invalidateQueries({
      queryKey: nfeDocumentsKeys.flowInstance(organizationId, documentId),
    });
    void queryClient.invalidateQueries({ queryKey: nfeDocumentsKeys.all });
  };

  const confirmPortaria = useMutation({
    ...confirmPortariaMutation(),
    onSuccess: () => {
      toast.success('Portaria confirmada');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const registerMigo = useMutation({
    ...registerMigoMutation(),
    onSuccess: () => {
      toast.success('MIGO registrado');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reject = useMutation({
    ...rejectInboundMutation(),
    onSuccess: () => {
      toast.success('Nota rejeitada');
      setRejectOpen(false);
      setRejectReason('');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const retry = useMutation({
    ...retrySapStepMutation(),
    onSuccess: () => {
      toast.success('Reprocessamento da etapa iniciado');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reprocess = useMutation({
    ...reprocessInboundMutation(),
    onSuccess: () => {
      toast.success('Reprocessamento iniciado');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = useMutation({
    ...resetInboundMutation(),
    onSuccess: (data) => {
      toast.success(
        `Documento resetado (${data.removedSapDocuments} registro(s) SAP removido(s))`,
      );
      setResetOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const status = inbound.inboundStatus;
  const terminal = isTerminalInboundStatus(status);
  const canReset = canResetInboundStatus(status);

  const runRetry = (step: SapRetryStep) =>
    retry.mutate({ organizationId, documentId, step });

  return (
    <div className='flex flex-wrap items-center gap-2 border-t pt-4'>
      {status === 'awaiting_portaria' && (
        <Button
          size='sm'
          onClick={() => confirmPortaria.mutate({ organizationId, documentId })}
          disabled={confirmPortaria.isPending}
        >
          Confirmar portaria
        </Button>
      )}
      {status === 'migo_pending' && (
        <Button
          size='sm'
          onClick={() =>
            registerMigo.mutate({
              organizationId,
              documentId,
              payload: { useSapStub: true },
            })
          }
          disabled={registerMigo.isPending}
        >
          Registrar MIGO
        </Button>
      )}
      {(status === 'inbound_error' || status === 'pedido_alert' || status === 'miro_pending') && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size='sm' variant='outline'>
              Retry SAP
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(status === 'inbound_error' || status === 'pedido_alert') && (
              <>
                <DropdownMenuItem onClick={() => runRetry('pedido')}>
                  Pedido
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runRetry('delivery')}>
                  Delivery
                </DropdownMenuItem>
              </>
            )}
            {(status === 'inbound_error' || status === 'miro_pending') && (
              <DropdownMenuItem onClick={() => runRetry('miro')}>
                MIRO
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canReset && terminal && (
        <Button
          size='sm'
          variant='outline'
          onClick={() => setResetOpen(true)}
          disabled={reset.isPending}
        >
          Resetar documento
        </Button>
      )}
      {terminal && (
        <DeleteDocumentButton
          organizationId={organizationId}
          documentId={documentId}
        />
      )}
      {!terminal && (
        <>
          <Button
            size='sm'
            variant='outline'
            onClick={() =>
              reprocess.mutate({ organizationId, documentId, runInline: true })
            }
            disabled={reprocess.isPending}
          >
            <IconRefresh className='mr-1 size-4' />
            Reprocessar
          </Button>
          {canReset && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setResetOpen(true)}
              disabled={reset.isPending}
            >
              Resetar documento
            </Button>
          )}
          <DeleteDocumentButton
            organizationId={organizationId}
            documentId={documentId}
          />
          <Button
            size='sm'
            variant='destructive'
            onClick={() => setRejectOpen(true)}
          >
            Rejeitar
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size='icon' variant='ghost' className='size-8'>
            <IconDotsVertical className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {canReset && (
            <DropdownMenuItem onClick={() => setResetOpen(true)}>
              Resetar documento
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              reprocess.mutate({ organizationId, documentId })
            }
          >
            Reprocessar (fila)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DeleteDocumentButton
            organizationId={organizationId}
            documentId={documentId}
            variant='menu-item'
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetar documento inbound</DialogTitle>
          </DialogHeader>
          <p className='text-muted-foreground text-sm'>
            O processo voltará para o status inicial (XML importado). Todos os
            documentos SAP criados (pedido, delivery, MIGO, MIRO) serão removidos
            e as validações dos itens serão limpas.
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant='destructive'
              disabled={reset.isPending}
              onClick={() => reset.mutate({ organizationId, documentId })}
            >
              Confirmar reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar nota inbound</DialogTitle>
          </DialogHeader>
          <div className='grid gap-2 py-2'>
            <Label htmlFor='reject-reason'>Motivo</Label>
            <Input
              id='reject-reason'
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder='Descreva o motivo da rejeição'
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant='destructive'
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={() =>
                reject.mutate({
                  organizationId,
                  documentId,
                  reason: rejectReason.trim(),
                })
              }
            >
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
