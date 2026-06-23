'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { flowConfigHistoryQueryOptions } from '../api/queries';

interface FlowVersionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  companyId: string;
  configId: string | null;
}

export function FlowVersionHistory({
  open,
  onOpenChange,
  organizationId,
  companyId,
  configId,
}: FlowVersionHistoryProps) {
  const { data, isLoading } = useQuery(
    flowConfigHistoryQueryOptions(organizationId, companyId, configId),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>Histórico de alterações</DialogTitle>
        </DialogHeader>
        <ScrollArea className='max-h-[400px]'>
          {isLoading && (
            <p className='text-muted-foreground text-sm'>Carregando...</p>
          )}
          <ul className='space-y-3'>
            {data?.items.map((item) => (
              <li key={item.id} className='rounded-lg border p-3 text-sm'>
                <div className='flex justify-between'>
                  <span className='font-medium'>{item.action}</span>
                  <span className='text-muted-foreground text-xs'>
                    v{item.version}
                  </span>
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {new Date(item.createdAt).toLocaleString('pt-BR')}
                </div>
                {item.reason && (
                  <p className='mt-2 text-xs'>{item.reason}</p>
                )}
              </li>
            ))}
            {data?.items.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                Nenhum registro de histórico.
              </p>
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
