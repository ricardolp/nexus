'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { IconGripVertical, IconSettings, IconTrash } from '@tabler/icons-react';

export type StepNodeData = {
  sequence: number;
  title: string;
  active: boolean;
  selected?: boolean;
  badges?: string[];
  onConfigure?: () => void;
  onRemove?: () => void;
};

function StepNodeComponent({ data }: NodeProps & { data: StepNodeData }) {
  return (
    <>
      <Handle type='target' position={Position.Top} className='!bg-primary' />
      <Card
        className={cn(
          'w-[480px] rounded-xl border bg-background p-4 shadow-sm',
          data.selected && 'border-primary ring-2 ring-primary/20',
        )}
      >
        <div className='flex items-center gap-3'>
          <div className='bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium'>
            {data.sequence}
          </div>
          <div className='min-w-0 flex-1'>
            <div className='truncate font-medium'>{data.title}</div>
            {data.badges && data.badges.length > 0 && (
              <div className='mt-2 flex flex-wrap gap-1'>
                {data.badges.map((badge) => (
                  <Badge key={badge} variant='secondary' className='text-xs'>
                    {badge}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Badge variant={data.active ? 'default' : 'secondary'}>
            {data.active ? 'Ativo' : 'Inativo'}
          </Badge>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8'
            onClick={data.onConfigure}
          >
            <IconSettings className='size-4' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8 text-destructive'
            onClick={data.onRemove}
          >
            <IconTrash className='size-4' />
          </Button>
          <IconGripVertical className='text-muted-foreground size-4' />
        </div>
      </Card>
      <Handle type='source' position={Position.Bottom} className='!bg-primary' />
    </>
  );
}

export const StepNode = memo(StepNodeComponent);
