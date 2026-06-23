'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_STATUS_LABELS,
  FLUXO_BADGE_CLASS,
  INBOUND_BADGE_CLASS,
  INBOUND_STATUS_LABELS,
  STATUS_BADGE_CLASS,
} from '../../constants/nfe-status-options';
import {
  formatChaveAcesso,
  formatCurrency,
  formatDateTime,
} from '../../lib/format';
import type {
  NfeDocumentListItem,
  NfeDocumentTimeline,
  NfeFlowInstance,
  NfeInboundProcess,
} from '../../api/types';
import { IconArrowLeft, IconCopy, IconFileText } from '@tabler/icons-react';
import { InboundActionBar } from './inbound-action-bar';
import { DeleteDocumentButton } from './delete-document-button';
import { DetailProcessingLogSheet } from './detail-processing-log-sheet';
import { extractValidationIssues } from '../../lib/extract-validation-issues';

type DetailHeaderProps = {
  document: NfeDocumentListItem;
  inbound: NfeInboundProcess | null;
  organizationId: string;
  timeline: NfeDocumentTimeline[];
  flowInstance: NfeFlowInstance | null;
  onOpenAlertsTab?: () => void;
};

export function DetailHeader({
  document,
  inbound,
  organizationId,
  timeline,
  flowInstance,
  onOpenAlertsTab,
}: DetailHeaderProps) {
  const [logOpen, setLogOpen] = useState(false);
  const modeloLabel = document.model === '55' ? 'NF-e' : 'NFC-e';
  const isInbound = document.direction === 'inbound';
  const alertIssues = extractValidationIssues({
    alertMessage: inbound?.alertMessage,
    flowInstance,
  });

  const handleCopyChave = async () => {
    if (!document.accessKey) return;
    try {
      await navigator.clipboard.writeText(document.accessKey);
      toast.success('Chave de acesso copiada');
    } catch {
      toast.error('Não foi possível copiar a chave');
    }
  };

  return (
    <div className='bg-card/40 flex flex-col gap-5 rounded-xl border p-5 shadow-sm md:p-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='flex min-w-0 flex-1 flex-col gap-4'>
          <Button variant='ghost' size='sm' className='-ml-2 w-fit' asChild>
            <Link href='/dashboard/documents/nfe'>
              <IconArrowLeft className='mr-1 size-4' />
              Voltar
            </Link>
          </Button>
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='text-xl font-semibold tracking-tight'>
                {modeloLabel} nº {document.number}
              </h1>
              <Badge variant='outline' className='tabular-nums'>
                Série {document.series}
              </Badge>
              <Badge
                variant='outline'
                className={cn(
                  'border-0 capitalize',
                  isInbound ? FLUXO_BADGE_CLASS.inbound : FLUXO_BADGE_CLASS.outbound,
                )}
              >
                {document.direction}
              </Badge>
              <Badge
                variant='outline'
                className={cn(
                  'border-0',
                  STATUS_BADGE_CLASS[document.status],
                )}
              >
                {DOCUMENT_STATUS_LABELS[document.status]}
              </Badge>
              {isInbound && inbound && (
                <Badge
                  variant='outline'
                  className={cn(
                    'border-0',
                    INBOUND_BADGE_CLASS[
                      document.statusInterno ?? 'inbound'
                    ],
                  )}
                >
                  {INBOUND_STATUS_LABELS[inbound.inboundStatus]}
                </Badge>
              )}
            </div>
            {document.accessKey && (
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <p className='text-muted-foreground font-mono text-xs break-all'>
                  {formatChaveAcesso(document.accessKey)}
                </p>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={handleCopyChave}
                >
                  <IconCopy className='size-3.5' />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className='flex items-start gap-2'>
          <div className='text-right'>
            <p className='text-muted-foreground text-xs'>Valor total</p>
            <p className='text-2xl font-semibold tabular-nums'>
              {formatCurrency(document.totalAmount)}
            </p>
            <p className='text-muted-foreground mt-1 text-xs'>
              Atualizado {formatDateTime(document.updatedAt)}
            </p>
          </div>
          {isInbound && (
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='mt-1 shrink-0'
              title='Ver log de processamento'
              onClick={() => setLogOpen(true)}
            >
              <IconFileText className='size-4' />
            </Button>
          )}
        </div>
      </div>

      {isInbound && inbound && (
        <InboundActionBar
          organizationId={organizationId}
          documentId={document.id}
          inbound={inbound}
        />
      )}

      {isInbound && alertIssues.length > 0 && (
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100'>
          <p>
            <strong>Alerta:</strong>{' '}
            {alertIssues.length === 1
              ? '1 divergência encontrada na validação.'
              : `${alertIssues.length} divergências encontradas na validação.`}
          </p>
          {onOpenAlertsTab && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='border-amber-500/50 bg-transparent hover:bg-amber-500/10'
              onClick={onOpenAlertsTab}
            >
              Ver detalhes
            </Button>
          )}
        </div>
      )}

      {!isInbound && (
        <div className='flex flex-col gap-3'>
          <div className='bg-muted/50 text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm'>
            Documento outbound — visualização simplificada. O fluxo SAP inbound não
            se aplica a esta nota.
          </div>
          <DeleteDocumentButton
            organizationId={organizationId}
            documentId={document.id}
            documentNumber={document.number}
          />
        </div>
      )}

      {isInbound && (
        <DetailProcessingLogSheet
          open={logOpen}
          onOpenChange={setLogOpen}
          timeline={timeline}
          flowInstance={flowInstance}
        />
      )}
    </div>
  );
}
