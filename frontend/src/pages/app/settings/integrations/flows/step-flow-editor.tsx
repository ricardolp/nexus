// Interactive canvas for the scenario form's "Etapas do SAP" section: each
// step in the template renders as a connected node on a dotted-grid canvas.
// Configurable steps get a 3-way mode switch; steps that carry extra
// per-step settings (e.g. purchase-order policy, MIGO movement type) get a
// gear button that opens a proper dialog with just that step's fields —
// a small popover was too cramped once a step had more than one or two
// fields, so this uses the same full dialog treatment as the rest of the
// form instead of squeezing everything into a tooltip-sized box.

import { useState, type ReactNode } from 'react';
import { SettingsIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { stepTypeLabels } from '../../../fiscal/inbound-labels';
import { STEP_ICONS, MODE_STYLES, type PipelineStep } from './step-pipeline';
import { STEP_MODES } from './templates';
import type { StepMode } from '@/lib/api-types';

export interface FlowStep extends PipelineStep {
  /** Dialog content for this step's own settings; omit when the step has no extra fields. */
  details?: ReactNode;
}

const SHORT_MODE_LABEL: Record<string, string> = {
  DISABLED: 'Off',
  AUTO: 'Auto',
  MANUAL: 'Manual'
};

export function StepFlowEditor({
  steps,
  onModeChange
}: {
  steps: FlowStep[];
  onModeChange: (type: string, mode: StepMode) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsStep, setDetailsStep] = useState<FlowStep | null>(null);

  return (
    <>
      <div
        className="overflow-x-auto rounded-lg border p-5"
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '16px 16px'
        }}
      >
        <div className="flex items-start" style={{ width: 'max-content' }}>
          {steps.map((step, i) => (
            <div key={`${step.type}-${i}`} className="flex items-start">
              <FlowNode
                step={step}
                onModeChange={onModeChange}
                onOpenDetails={() => {
                  setDetailsStep(step);
                  setDialogOpen(true);
                }}
              />
              {i < steps.length - 1 && <Connector />}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton
          className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          {detailsStep && (
            <>
              <GradientDialogHeader
                icon={STEP_ICONS[detailsStep.type] ?? SettingsIcon}
                title={stepTypeLabels[detailsStep.type] ?? detailsStep.type}
                description="Dados específicos desta etapa do fluxo."
              />
              <div className="min-h-0 flex-1 overflow-y-auto p-6">{detailsStep.details}</div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Connector() {
  return (
    <div className="mt-7 flex h-4 w-9 shrink-0 items-center justify-center">
      <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
        <path d="M0 8 H28" stroke="var(--border-strong, var(--border))" strokeWidth="1.5" strokeDasharray="3 3" />
        <path
          d="M28 3 L34 8 L28 13"
          stroke="var(--border-strong, var(--border))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function FlowNode({
  step,
  onModeChange,
  onOpenDetails
}: {
  step: FlowStep;
  onModeChange: (type: string, mode: StepMode) => void;
  onOpenDetails: () => void;
}) {
  const Icon = STEP_ICONS[step.type];
  const style = step.mode ? MODE_STYLES[step.mode] : undefined;

  return (
    <div className="bg-background relative w-[170px] shrink-0 rounded-xl border p-3">
      {step.details && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-2 right-2 flex size-6 items-center justify-center rounded-md"
        >
          <span className="sr-only">Dados da etapa</span>
          <SettingsIcon className="size-3.5" />
        </button>
      )}

      <div
        className={cn('mb-2 flex size-9 items-center justify-center rounded-lg', style ? style.bg : 'bg-muted')}
      >
        {Icon && <Icon className={cn('size-4', style ? style.icon : 'text-muted-foreground')} />}
      </div>

      <p className="pr-5 text-sm leading-tight font-medium">{stepTypeLabels[step.type] ?? step.type}</p>

      {step.mode !== undefined ? (
        <div className="bg-muted mt-2.5 flex gap-0.5 rounded-md p-0.5">
          {STEP_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onModeChange(step.type, m.value as StepMode)}
              className={cn(
                'flex-1 rounded px-1 py-1 text-[11px] font-medium transition-colors',
                step.mode === m.value
                  ? cn(MODE_STYLES[m.value]?.bg, MODE_STYLES[m.value]?.icon)
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {SHORT_MODE_LABEL[m.value] ?? m.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground bg-muted mt-2.5 inline-block rounded-md px-2 py-1 text-[11px]">
          Conduzido pelo motor
        </span>
      )}
    </div>
  );
}
