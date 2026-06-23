'use client';

import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { STEP_LIBRARY } from '../constants/step-library';
import {
  DRAG_STEP_KEY,
  DRAG_STEP_NAME,
  DRAG_STEP_PAYLOAD,
} from '../constants/drag-payload';
import {
  IconAlertTriangle,
  IconBox,
  IconClipboardList,
  IconClock,
  IconCurrencyDollar,
  IconFileText,
  IconSearch,
  IconTruck,
  IconUser,
} from '@tabler/icons-react';

const ICONS: Record<string, React.ReactNode> = {
  search: <IconSearch className='size-4' />,
  clipboard: <IconClipboardList className='size-4' />,
  dollar: <IconCurrencyDollar className='size-4' />,
  box: <IconBox className='size-4' />,
  user: <IconUser className='size-4' />,
  truck: <IconTruck className='size-4' />,
  clock: <IconClock className='size-4' />,
  document: <IconFileText className='size-4' />,
  alert: <IconAlertTriangle className='size-4' />,
};

export function StepLibrary() {
  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden border-r'>
      <div className='shrink-0 border-b p-4'>
        <h3 className='text-sm font-semibold'>Biblioteca de etapas</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          Arraste para o canvas central
        </p>
      </div>
      <ScrollArea className='min-h-0 flex-1'>
        <div className='flex flex-col gap-2 p-3 pb-6'>
          {STEP_LIBRARY.map((item, index) => (
            <Card
              key={`${item.stepKey}-${index}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_STEP_KEY, item.stepKey);
                e.dataTransfer.setData(DRAG_STEP_NAME, item.name);
                e.dataTransfer.setData(
                  DRAG_STEP_PAYLOAD,
                  JSON.stringify({ stepKey: item.stepKey, name: item.name }),
                );
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              className='hover:border-primary/50 cursor-grab p-3 active:cursor-grabbing'
            >
              <div className='flex items-center gap-2 text-sm'>
                <span className='text-primary'>{ICONS[item.icon]}</span>
                <span>{item.name}</span>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
