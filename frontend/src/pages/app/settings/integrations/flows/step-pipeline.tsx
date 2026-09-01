// Read-only, connected-step preview of a process template — used for the
// scenario list cards and the template picker in the edit dialog. The
// interactive editor for the independently-configurable step modes lives in
// ./step-flow-editor.tsx; this component only ever renders the current
// state, it never changes it.

import type { ComponentType } from 'react';
import {
  CalculatorIcon,
  MinusIcon,
  PackageCheckIcon,
  PackageSearchIcon,
  ReceiptIcon,
  SearchIcon,
  ShoppingCartIcon,
  TruckIcon,
  UserCheckIcon,
  WrenchIcon
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { stepTypeLabels } from '../../../fiscal/inbound-labels';

export const STEP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  RESOLVE_VENDOR: UserCheckIcon,
  RESOLVE_MATERIAL: PackageSearchIcon,
  SEARCH_PURCHASE_ORDER: SearchIcon,
  CREATE_PURCHASE_ORDER: ShoppingCartIcon,
  CREATE_INBOUND_DELIVERY: TruckIcon,
  POST_GOODS_RECEIPT: PackageCheckIcon,
  CREATE_SERVICE_ENTRY: WrenchIcon,
  POST_SUPPLIER_INVOICE: ReceiptIcon,
  POST_ACCOUNTING_DOCUMENT: CalculatorIcon
};

export const MODE_STYLES: Record<string, { ring: string; bg: string; icon: string; badge: string; label: string }> = {
  AUTO: {
    ring: 'ring-emerald-500/40',
    bg: 'bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    label: 'Automático'
  },
  MANUAL: {
    ring: 'ring-amber-500/40',
    bg: 'bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    label: 'Manual'
  },
  DISABLED: {
    ring: 'ring-slate-500/30',
    bg: 'bg-slate-500/15',
    icon: 'text-slate-600 dark:text-slate-300',
    badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
    label: 'Desabilitado'
  }
};

export interface PipelineStep {
  type: string;
  /** undefined = this step isn't independently configurable — it always runs per the engine's own logic */
  mode?: string;
}

/** Builds the ordered node list for a template, attaching the modes that are independently configurable. */
export function buildPipelineSteps(
  templateSteps: string[],
  modes: { inbound_delivery_mode?: string; goods_receipt_mode?: string; supplier_invoice_mode?: string }
): PipelineStep[] {
  return templateSteps.map((type) => {
    if (type === 'CREATE_INBOUND_DELIVERY') return { type, mode: modes.inbound_delivery_mode };
    if (type === 'POST_GOODS_RECEIPT') return { type, mode: modes.goods_receipt_mode };
    if (type === 'POST_SUPPLIER_INVOICE') return { type, mode: modes.supplier_invoice_mode };
    return { type };
  });
}

export function StepPipeline({ steps, size = 'md' }: { steps: PipelineStep[]; size?: 'sm' | 'md' }) {
  const compact = size === 'sm';

  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[step.type] ?? MinusIcon;
        const style = step.mode ? MODE_STYLES[step.mode] : undefined;

        return (
          <div key={`${step.type}-${i}`} className="flex items-start">
            <div className={cn('flex shrink-0 flex-col items-center gap-1.5', compact ? 'w-16' : 'w-[92px]')}>
              <div
                className={cn(
                  'flex items-center justify-center rounded-full ring-2',
                  compact ? 'size-8' : 'size-10',
                  style ? cn(style.bg, style.ring) : 'bg-muted ring-border'
                )}
              >
                <Icon className={cn(compact ? 'size-3.5' : 'size-4', style ? style.icon : 'text-muted-foreground')} />
              </div>
              <p className={cn('text-center leading-tight', compact ? 'text-[10px]' : 'text-xs')}>
                {stepTypeLabels[step.type] ?? step.type}
              </p>
              {style ? (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', style.badge)}>
                  {style.label}
                </span>
              ) : (
                <span className="text-muted-foreground text-center text-[10px] leading-tight">Automático</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={cn('bg-border shrink-0', compact ? 'mt-4 h-px w-4' : 'mt-5 h-px w-6')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
