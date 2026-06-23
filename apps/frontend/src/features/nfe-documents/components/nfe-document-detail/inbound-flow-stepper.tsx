'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  IconCheck,
  IconChevronDown,
  IconAlertTriangle,
  IconX,
  IconLoader2,
} from '@tabler/icons-react';
import type { InboundFlowStep } from '../../lib/build-inbound-steps';
import type { InboundStepVisualState } from '../../constants/nfe-status-options';
import { SAP_DOC_TYPE_LABELS } from '../../constants/nfe-status-options';
import { formatDateTime } from '../../lib/format';

const STATE_STYLES: Record<
  InboundStepVisualState,
  { ring: string; dot: string; line: string; icon?: React.ReactNode }
> = {
  done: {
    ring: 'border-emerald-500 bg-emerald-500 text-white',
    dot: 'bg-emerald-500',
    line: 'bg-emerald-500',
    icon: <IconCheck className='size-3.5' stroke={2.5} />,
  },
  current: {
    ring: 'border-primary bg-primary text-primary-foreground animate-pulse',
    dot: 'bg-primary',
    line: 'bg-primary/40',
    icon: <IconLoader2 className='size-3.5 animate-spin' />,
  },
  pending: {
    ring: 'border-muted-foreground/30 bg-background text-muted-foreground',
    dot: 'bg-muted-foreground/30',
    line: 'bg-border',
  },
  warning: {
    ring: 'border-amber-500 bg-amber-500 text-white',
    dot: 'bg-amber-500',
    line: 'bg-amber-400',
    icon: <IconAlertTriangle className='size-3.5' />,
  },
  error: {
    ring: 'border-red-500 bg-red-500 text-white',
    dot: 'bg-red-500',
    line: 'bg-red-400',
    icon: <IconX className='size-3.5' />,
  },
};

type InboundFlowStepperProps = {
  steps: InboundFlowStep[];
  className?: string;
};

export function InboundFlowStepper({ steps, className }: InboundFlowStepperProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(
    steps.find((s) => s.state === 'current' || s.state === 'warning' || s.state === 'error')?.key ??
      null,
  );

  if (steps.length === 0) return null;

  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>Fluxo de processamento inbound</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='hidden lg:block'>
          <div className='flex items-start gap-0'>
            {steps.map((step, index) => {
              const style = STATE_STYLES[step.state];
              const isLast = index === steps.length - 1;
              const isExpanded = expandedKey === step.key;

              return (
                <div key={step.key} className='flex min-w-0 flex-1 flex-col items-center'>
                  <div className='flex w-full items-center'>
                    {index > 0 && (
                      <div
                        className={cn('h-0.5 flex-1', style.line)}
                        aria-hidden
                      />
                    )}
                    <button
                      type='button'
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-shadow hover:shadow-md',
                        style.ring,
                      )}
                      aria-label={step.label}
                      onClick={() =>
                        setExpandedKey(isExpanded ? null : step.key)
                      }
                    >
                      {style.icon ?? (
                        <span className='text-xs font-semibold'>{index + 1}</span>
                      )}
                    </button>
                    {!isLast && (
                      <div
                        className={cn(
                          'h-0.5 flex-1',
                          steps[index + 1]?.state === 'pending'
                            ? 'bg-border'
                            : STATE_STYLES[steps[index + 1]!.state].line,
                        )}
                        aria-hidden
                      />
                    )}
                  </div>
                  <button
                    type='button'
                    className='mt-2 max-w-[120px] text-center'
                    onClick={() =>
                      setExpandedKey(isExpanded ? null : step.key)
                    }
                  >
                    <p
                      className={cn(
                        'text-xs leading-tight',
                        step.state === 'current' && 'font-semibold text-primary',
                        step.state === 'done' && 'text-foreground',
                        step.state === 'pending' && 'text-muted-foreground',
                      )}
                    >
                      {step.label}
                    </p>
                    {step.completedAt && (
                      <p className='text-muted-foreground mt-0.5 text-[10px] tabular-nums'>
                        {formatDateTime(step.completedAt)}
                      </p>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className='space-y-2 lg:hidden'>
          {steps.map((step, index) => (
            <StepRow
              key={step.key}
              step={step}
              index={index}
              expanded={expandedKey === step.key}
              onToggle={() =>
                setExpandedKey(expandedKey === step.key ? null : step.key)
              }
            />
          ))}
        </div>

        {expandedKey && (
          <StepDetailPanel
            step={steps.find((s) => s.key === expandedKey)!}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StepRow({
  step,
  index,
  expanded,
  onToggle,
}: {
  step: InboundFlowStep;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = STATE_STYLES[step.state];
  return (
    <button
      type='button'
      onClick={onToggle}
      className='hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border p-3 text-left'
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border-2',
          style.ring,
        )}
      >
        {style.icon ?? <span className='text-xs font-medium'>{index + 1}</span>}
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>{step.label}</p>
        {step.completedAt && (
          <p className='text-muted-foreground text-xs'>
            {formatDateTime(step.completedAt)}
          </p>
        )}
      </div>
      <IconChevronDown
        className={cn(
          'text-muted-foreground size-4 transition-transform',
          expanded && 'rotate-180',
        )}
      />
    </button>
  );
}

function StepDetailPanel({ step }: { step: InboundFlowStep }) {
  const hasContent =
    step.sapDocuments.length > 0 || step.flowExecutions.length > 0;

  return (
    <div className='bg-muted/30 rounded-lg border p-4'>
      <p className='mb-3 text-sm font-medium'>{step.label}</p>
      {!hasContent && (
        <p className='text-muted-foreground text-sm'>
          Nenhum documento ou evento registrado nesta etapa.
        </p>
      )}
      {step.sapDocuments.length > 0 && (
        <div className='mb-3'>
          <p className='text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide'>
            Documentos SAP
          </p>
          <div className='flex flex-wrap gap-2'>
            {step.sapDocuments.map((doc) => (
              <Badge key={doc.id} variant='secondary' className='font-mono text-xs'>
                {SAP_DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}:{' '}
                {doc.docNumber}
                {doc.fiscalYear ? ` / ${doc.fiscalYear}` : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {step.flowExecutions.length > 0 && (
        <div>
          <p className='text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide'>
            Execuções do fluxo
          </p>
          <ul className='space-y-1 text-sm'>
            {step.flowExecutions.map((exec) => (
              <li key={exec.id} className='flex items-center gap-2'>
                <Badge variant='outline' className='text-xs'>
                  {exec.status}
                </Badge>
                <span>{exec.stepKey}</span>
                {exec.message && (
                  <span className='text-muted-foreground truncate'>
                    — {exec.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
