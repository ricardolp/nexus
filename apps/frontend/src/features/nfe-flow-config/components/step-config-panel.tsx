'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { IconX } from '@tabler/icons-react';
import { useFlowEditorStore } from '../hooks/use-flow-editor-store';
import type { FlowStepDto } from '../api/types';

const VALUE_TAX_TYPES = ['ICMS', 'IPI', 'PIS', 'COFINS'] as const;

const DEFAULT_ITEM_VALUE_TAX_TYPES = ['ICMS'];
const DEFAULT_TOTAL_VALUE_TAX_TYPES = ['ICMS', 'IPI'];
const DEFAULT_TAX_COMPARISON_TYPES = ['ICMS', 'IPI'];

export function StepConfigPanel() {
  const config = useFlowEditorStore((s) => s.config);
  const selectedStepId = useFlowEditorStore((s) => s.selectedStepId);
  const selectStep = useFlowEditorStore((s) => s.selectStep);
  const updateStep = useFlowEditorStore((s) => s.updateStep);

  const step = config?.steps.find((s) => s.id === selectedStepId);

  if (!step) {
    return (
      <div className='text-muted-foreground flex h-full min-h-0 items-center justify-center overflow-hidden border-l p-6 text-center text-sm'>
        Selecione uma etapa no canvas para configurar
      </div>
    );
  }

  const updateConfig = (key: string, value: unknown) => {
    updateStep(step.id, {
      config: { ...step.config, [key]: value },
    });
  };

  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden border-l'>
      <div className='flex shrink-0 items-center justify-between border-b p-4'>
        <h3 className='text-sm font-semibold'>Configurar etapa</h3>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={() => selectStep(null)}
        >
          <IconX className='size-4' />
        </Button>
      </div>
      <ScrollArea className='min-h-0 flex-1'>
        <div className='flex flex-col gap-4 p-4 pb-8'>
          <div className='space-y-2'>
            <Label>Nome da etapa</Label>
            <Input
              value={step.name}
              onChange={(e) => updateStep(step.id, { name: e.target.value })}
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label>Etapa ativa</Label>
            <Switch
              checked={step.active}
              onCheckedChange={(active) => updateStep(step.id, { active })}
            />
          </div>

          {step.stepKey === 'VALIDATIONS' && (
            <ValidationConfig step={step} updateConfig={updateConfig} />
          )}
          {step.stepKey === 'FETCH_PURCHASE_ORDERS' && (
            <FetchOrdersConfig step={step} updateConfig={updateConfig} />
          )}
          {step.stepKey === 'WAIT_GATE_STATUS' && (
            <WaitGateConfig step={step} updateConfig={updateConfig} />
          )}
          {(step.stepKey === 'CREATE_DELIVERY' ||
            step.stepKey === 'POST_MIGO' ||
            step.stepKey === 'CREATE_INVOICE') && (
            <ActionConfig step={step} updateConfig={updateConfig} />
          )}

          <div className='space-y-2'>
            <Label>Condição para avançar</Label>
            <Input
              value={String(step.config.advanceCondition ?? '')}
              onChange={(e) => updateConfig('advanceCondition', e.target.value)}
              placeholder='Todas as validações devem estar OK'
            />
          </div>
          <div className='space-y-2'>
            <Label>Ação em caso de erro</Label>
            <Select
              value={String(step.config.onError ?? 'BLOCK_AND_NOTIFY')}
              onValueChange={(v) => updateConfig('onError', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='BLOCK_PROCESS'>Bloquear processo</SelectItem>
                <SelectItem value='BLOCK_AND_NOTIFY'>
                  Bloquear e notificar
                </SelectItem>
                <SelectItem value='NOTIFY_RESPONSIBLE'>
                  Notificar responsável
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ValidationConfig({
  step,
  updateConfig,
}: {
  step: FlowStepDto;
  updateConfig: (key: string, value: unknown) => void;
}) {
  const rules = [
    ['validatePurchaseOrder', 'Validar pedido'],
    ['validateSupplier', 'Validar fornecedor'],
    ['validateTotalValue', 'Validar valor total'],
    ['validateItemValue', 'Validar valor dos itens'],
    ['validateQuantity', 'Validar quantidade'],
    ['validateTaxes', 'Validar impostos'],
    ['validateDivergence', 'Validar divergência'],
  ] as const;

  return (
    <div className='space-y-3'>
      <Label>Regras</Label>
      {rules.map(([key, label]) => (
        <label key={key} className='flex items-center gap-2 text-sm'>
          <Checkbox
            checked={Boolean(step.config[key])}
            onCheckedChange={(v) => updateConfig(key, Boolean(v))}
          />
          {label}
        </label>
      ))}
      <div className='space-y-2'>
        <Label>Tolerância de valor (R$)</Label>
        <Input
          type='number'
          step='0.01'
          value={String(step.config.valueTolerance ?? 0.05)}
          onChange={(e) =>
            updateConfig('valueTolerance', Number(e.target.value))
          }
        />
      </div>
      <div className='space-y-2'>
        <Label>Tolerância percentual (%)</Label>
        <Input
          type='number'
          step='0.01'
          value={String(step.config.percentageTolerance ?? 0.5)}
          onChange={(e) =>
            updateConfig('percentageTolerance', Number(e.target.value))
          }
        />
      </div>
      <TaxTypesConfig
        label='Impostos a somar no valor do item (vProd)'
        configKey='itemValueTaxTypes'
        step={step}
        updateConfig={updateConfig}
        defaults={DEFAULT_ITEM_VALUE_TAX_TYPES}
      />
      <TaxTypesConfig
        label='Impostos a somar no valor total (vNF)'
        configKey='totalValueTaxTypes'
        step={step}
        updateConfig={updateConfig}
        defaults={DEFAULT_TOTAL_VALUE_TAX_TYPES}
      />
      <TaxTypesConfig
        label='Impostos a comparar individualmente (desmarque para ignorar)'
        configKey='taxComparisonTypes'
        step={step}
        updateConfig={updateConfig}
        defaults={DEFAULT_TAX_COMPARISON_TYPES}
        disabled={!step.config.validateTaxes}
      />
    </div>
  );
}

function TaxTypesConfig({
  label,
  configKey,
  step,
  updateConfig,
  defaults,
  disabled = false,
}: {
  label: string;
  configKey: string;
  step: FlowStepDto;
  updateConfig: (key: string, value: unknown) => void;
  defaults: string[];
  disabled?: boolean;
}) {
  const raw = step.config[configKey];
  const selected = Array.isArray(raw)
    ? raw.map((v) => String(v).toUpperCase())
    : defaults;

  const toggle = (tipo: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selected, tipo])]
      : selected.filter((t) => t !== tipo);
    updateConfig(configKey, next);
  };

  return (
    <div className={disabled ? 'space-y-2 opacity-50' : 'space-y-2'}>
      <Label>{label}</Label>
      {VALUE_TAX_TYPES.map((tipo) => (
        <label key={tipo} className='flex items-center gap-2 text-sm'>
          <Checkbox
            checked={selected.includes(tipo)}
            disabled={disabled}
            onCheckedChange={(v) => toggle(tipo, Boolean(v))}
          />
          {tipo}
        </label>
      ))}
    </div>
  );
}

function FetchOrdersConfig({
  step,
  updateConfig,
}: {
  step: FlowStepDto;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <div className='space-y-2'>
      <label className='flex items-center gap-2 text-sm'>
        <Checkbox
          checked={Boolean(step.config.searchByXmlPurchaseOrder)}
          onCheckedChange={(v) => updateConfig('searchByXmlPurchaseOrder', Boolean(v))}
        />
        Pedido pelo XML
      </label>
      <label className='flex items-center gap-2 text-sm'>
        <Checkbox
          checked={Boolean(step.config.required)}
          onCheckedChange={(v) => updateConfig('required', Boolean(v))}
        />
        Obrigatório encontrar pedido
      </label>
    </div>
  );
}

function WaitGateConfig({
  step,
  updateConfig,
}: {
  step: FlowStepDto;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <div className='space-y-3'>
      <div className='space-y-2'>
        <Label>Status esperado</Label>
        <Input
          value={String(step.config.expectedStatus ?? 'EM_PORTARIA')}
          onChange={(e) => updateConfig('expectedStatus', e.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label>Tempo máximo (horas)</Label>
        <Input
          type='number'
          value={String(step.config.timeoutHours ?? 24)}
          onChange={(e) => updateConfig('timeoutHours', Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function ActionConfig({
  step,
  updateConfig,
}: {
  step: FlowStepDto;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <label className='flex items-center gap-2 text-sm'>
      <Checkbox
        checked={Boolean(step.config.automatic)}
        onCheckedChange={(v) => updateConfig('automatic', Boolean(v))}
      />
      Executar automaticamente
    </label>
  );
}
