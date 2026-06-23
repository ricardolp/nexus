'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  IconChevronDown,
  IconCloud,
  IconFileText,
  IconHistory,
  IconPlayerPlay,
} from '@tabler/icons-react';
import type { FlowConfigFull } from '../api/types';

interface FlowFooterActionsProps {
  config: FlowConfigFull | null;
  isDirty: boolean;
  isSaving?: boolean;
  isPublishing?: boolean;
  onSaveDraft: () => void;
  onTestFlow: () => void;
  onPublish: () => void;
  onShowHistory: () => void;
}

export function FlowFooterActions({
  config,
  isDirty,
  isSaving,
  isPublishing,
  onSaveDraft,
  onTestFlow,
  onPublish,
  onShowHistory,
}: FlowFooterActionsProps) {
  const updatedAt = config?.updatedAt
    ? new Date(config.updatedAt).toLocaleString('pt-BR')
    : '—';

  return (
    <div className='bg-background flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3'>
      <div className='text-muted-foreground flex items-center gap-3 text-xs'>
        <span>Última alteração: {updatedAt}</span>
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-auto p-0 text-xs'
          onClick={onShowHistory}
        >
          <IconHistory className='mr-1 size-3' />
          Ver histórico
        </Button>
      </div>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={onSaveDraft}
          disabled={!config || isSaving || (!isDirty && config.status === 'published')}
        >
          <IconFileText className='mr-2 size-4' />
          Salvar rascunho
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={onTestFlow}
          disabled={!config}
        >
          <IconPlayerPlay className='mr-2 size-4' />
          Testar fluxo
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type='button' size='sm' disabled={!config || isPublishing}>
              <IconCloud className='mr-2 size-4' />
              Publicar fluxo
              <IconChevronDown className='ml-2 size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={onPublish}>Publicar agora</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
