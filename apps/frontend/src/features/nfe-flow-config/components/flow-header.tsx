'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { IconCloudUpload } from '@tabler/icons-react';
import { NF_MODEL_OPTIONS } from '../constants/model-options';
import type { FlowConfigSummary } from '../api/types';

interface FlowHeaderProps {
  companies: Array<{ id: string; razaoSocial: string }>;
  companyId: string | null;
  model: string;
  configs: FlowConfigSummary[];
  activeConfigId: string | null;
  flowActive: boolean;
  onCompanyChange: (companyId: string) => void;
  onModelChange: (model: string) => void;
  onConfigChange: (configId: string) => void;
  onFlowActiveChange: (active: boolean) => void;
  onPublish: () => void;
  isPublishing?: boolean;
}

export function FlowHeader({
  companies,
  companyId,
  model,
  configs,
  activeConfigId,
  flowActive,
  onCompanyChange,
  onModelChange,
  onConfigChange,
  onFlowActiveChange,
  onPublish,
  isPublishing,
}: FlowHeaderProps) {
  return (
    <div className='bg-muted/30 flex flex-wrap items-end gap-4 border-b px-4 py-3'>
      <div className='space-y-1'>
        <Label className='text-xs'>Empresa</Label>
        <Select value={companyId ?? ''} onValueChange={onCompanyChange}>
          <SelectTrigger className='w-[220px]'>
            <SelectValue placeholder='Selecione a empresa' />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.razaoSocial}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Modelo da NF</Label>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NF_MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex items-center gap-2'>
        <Label className='text-xs'>Fluxo ativo</Label>
        <Switch checked={flowActive} onCheckedChange={onFlowActiveChange} />
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Versão do processo</Label>
        <Select value={activeConfigId ?? ''} onValueChange={onConfigChange}>
          <SelectTrigger className='w-[140px]'>
            <SelectValue placeholder='Versão' />
          </SelectTrigger>
          <SelectContent>
            {configs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.version} ({c.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={onPublish}
        disabled={!activeConfigId || isPublishing}
      >
        <IconCloudUpload className='mr-2 size-4' />
        Publicar configuração
      </Button>
    </div>
  );
}
