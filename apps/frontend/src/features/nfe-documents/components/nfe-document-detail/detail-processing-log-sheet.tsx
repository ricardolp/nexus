'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDateTime } from '../../lib/format';
import type {
  NfeDocumentTimeline,
  NfeFlowInstance,
} from '../../api/types';

type DetailProcessingLogSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeline: NfeDocumentTimeline[];
  flowInstance: NfeFlowInstance | null;
};

export function DetailProcessingLogSheet({
  open,
  onOpenChange,
  timeline,
  flowInstance,
}: DetailProcessingLogSheetProps) {
  const executions = flowInstance?.executions ?? [];
  const sortedTimeline = [...timeline].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>Log de processamento</SheetTitle>
          <SheetDescription>
            Histórico cronológico das etapas e execuções do fluxo inbound.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-6 overflow-y-auto pr-1'>
          {executions.length > 0 && (
            <section className='space-y-3'>
              <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                Execuções do fluxo
              </h3>
              <div className='space-y-2'>
                {executions.map((execution) => (
                  <div
                    key={execution.id}
                    className='bg-muted/40 rounded-lg border px-3 py-2.5 text-sm'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{execution.stepKey}</span>
                      <Badge variant='outline' className='text-xs'>
                        {execution.status}
                      </Badge>
                    </div>
                    {execution.message && (
                      <p className='text-muted-foreground mt-1 text-xs'>
                        {execution.message}
                      </p>
                    )}
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {formatDateTime(execution.finishedAt ?? execution.startedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className='space-y-3'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Histórico
            </h3>
            {sortedTimeline.length === 0 ? (
              <p className='text-muted-foreground py-4 text-center text-sm'>
                Nenhum registro no log.
              </p>
            ) : (
              <div className='space-y-2'>
                {sortedTimeline.map((entry) => (
                  <div
                    key={entry.id}
                    className='rounded-lg border px-3 py-2.5 text-sm'
                  >
                    <div className='flex flex-wrap items-start justify-between gap-2'>
                      <span className='font-medium'>{entry.title}</span>
                      <Badge variant='secondary' className='text-xs capitalize'>
                        {entry.source}
                      </Badge>
                    </div>
                    {entry.message && (
                      <p className='text-muted-foreground mt-1 text-xs leading-relaxed whitespace-pre-wrap'>
                        {entry.message}
                      </p>
                    )}
                    <p className='text-muted-foreground mt-1.5 text-xs'>
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className='border-t pt-4'>
          <Button variant='outline' className='w-full' onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
