'use client';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { webhookDeliveriesQueryOptions } from '../api/queries';
import type { WebhookEndpoint } from '../api/types';
import { formatDateTime, WEBHOOK_DELIVERY_STATUS_LABELS } from '../lib/format';

interface WebhookDeliveriesDialogProps {
  organizationId: string;
  webhook: WebhookEndpoint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebhookDeliveriesDialog({
  organizationId,
  webhook,
  open,
  onOpenChange,
}: WebhookDeliveriesDialogProps) {
  const deliveriesQuery = useQuery({
    ...webhookDeliveriesQueryOptions(organizationId, webhook.id, 1),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Entregas do webhook</DialogTitle>
          <DialogDescription className='truncate font-mono text-xs'>
            {webhook.url}
          </DialogDescription>
        </DialogHeader>
        {deliveriesQuery.isLoading ? (
          <div className='flex min-h-[200px] items-center justify-center'>
            <Spinner />
          </div>
        ) : (
          <div className='max-h-[420px] overflow-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Entregue em</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveriesQuery.data?.items.length ? (
                  deliveriesQuery.data.items.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className='font-mono text-xs'>
                        {delivery.eventType}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            delivery.status === 'delivered'
                              ? 'default'
                              : delivery.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {WEBHOOK_DELIVERY_STATUS_LABELS[delivery.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{delivery.attempts}</TableCell>
                      <TableCell>{formatDateTime(delivery.deliveredAt)}</TableCell>
                      <TableCell>{formatDateTime(delivery.createdAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className='text-muted-foreground text-center'>
                      Nenhuma entrega registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
