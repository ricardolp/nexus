'use client';

import { useAuth } from '@/context/auth-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createFlowConfigDraft,
  publishFlowConfig,
  saveFlowConfigDraft,
  testFlowConfig,
} from '../api/service';
import {
  flowConfigDetailQueryOptions,
  flowConfigListQueryOptions,
  nfeFlowConfigKeys,
} from '../api/queries';
import type { FlowStepDto } from '../api/types';
import { STEP_LIBRARY } from '../constants/step-library';
import { useFlowEditorStore } from '../hooks/use-flow-editor-store';
import { FlowCanvas } from './flow-canvas';
import { FlowFooterActions } from './flow-footer-actions';
import { FlowHeader } from './flow-header';
import { FlowVersionHistory } from './flow-version-history';
import { StepConfigPanel } from './step-config-panel';
import { StepLibrary } from './step-library';
import { TestFlowDialog } from './test-flow-dialog';
import { organizationCompaniesQueryOptions } from '@/features/organization/api/queries';

function buildAutoEdges(steps: FlowStepDto[]) {
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  const edges = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const source = sorted[i]!;
    const target = sorted[i + 1]!;
    if (source.stepKey === 'VALIDATIONS') continue;
    edges.push({
      id: `edge-${source.id}-${target.id}`,
      flowConfigId: source.flowConfigId,
      sourceStepId: source.id,
      targetStepId: target.id,
      conditionType: 'success' as const,
      conditionExpression: null,
    });
  }
  const validations = sorted.find((s) => s.stepKey === 'VALIDATIONS');
  const notify = sorted.find((s) => s.stepKey === 'NOTIFY_ERROR');
  if (validations && notify) {
    edges.push({
      id: `edge-${validations.id}-${notify.id}-error`,
      flowConfigId: validations.flowConfigId,
      sourceStepId: validations.id,
      targetStepId: notify.id,
      conditionType: 'error' as const,
      conditionExpression: null,
    });
  }
  return edges;
}

export function NfeFlowConfigPage() {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [model, setModel] = useState('55');
  const [configId, setConfigId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const config = useFlowEditorStore((s) => s.config);
  const setConfig = useFlowEditorStore((s) => s.setConfig);
  const appendStep = useFlowEditorStore((s) => s.appendStep);
  const markClean = useFlowEditorStore((s) => s.markClean);
  const patchConfig = useFlowEditorStore((s) => s.patchConfig);
  const isDirty = useFlowEditorStore((s) => s.isDirty);

  const orgId = activeOrganizationId ?? '';

  const { data: companiesData } = useQuery(
    organizationCompaniesQueryOptions(orgId, { page: 1, limit: 100, search: '' }),
  );

  const { data: listData } = useQuery(
    flowConfigListQueryOptions(orgId, companyId ?? '', model),
  );

  const { data: detailData } = useQuery(
    flowConfigDetailQueryOptions(orgId, companyId ?? '', configId),
  );

  useEffect(() => {
    if (!companyId && companiesData?.items[0]) {
      setCompanyId(companiesData.items[0].id);
    }
  }, [companiesData, companyId]);

  useEffect(() => {
    if (!detailData || detailData.id !== configId) return;
    if (!isDirty) {
      setConfig(detailData);
    }
  }, [detailData, configId, isDirty, setConfig]);

  const createMutation = useMutation({
    mutationFn: () => createFlowConfigDraft(orgId, companyId!, model),
    onSuccess: (data) => {
      setConfigId(data.id);
      setConfig(data);
      queryClient.invalidateQueries({ queryKey: nfeFlowConfigKeys.all });
      toast.success('Fluxo padrão criado.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!listData) return;
    if (listData.items.length === 0 && companyId && orgId && !createMutation.isPending) {
      createMutation.mutate();
      return;
    }
    if (!configId && listData.items[0]) {
      setConfigId(listData.items[0].id);
    }
  }, [listData, companyId, orgId, configId, createMutation.isPending]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!config || !companyId || !configId) throw new Error('Configuração inválida');
      const edges =
        config.edges.length > 0 ? config.edges : buildAutoEdges(config.steps);
      return saveFlowConfigDraft(orgId, companyId, configId, {
        name: config.name,
        active: config.active,
        steps: config.steps.map((s, i) => ({
          ...s,
          sequence: i + 1,
        })),
        edges,
      });
    },
    onSuccess: (data) => {
      setConfig(data);
      markClean();
      queryClient.invalidateQueries({ queryKey: nfeFlowConfigKeys.all });
      toast.success('Rascunho salvo.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!companyId || !configId) throw new Error('Configuração inválida');
      return publishFlowConfig(orgId, companyId, configId);
    },
    onSuccess: (data) => {
      setConfig(data);
      markClean();
      queryClient.invalidateQueries({ queryKey: nfeFlowConfigKeys.all });
      toast.success('Fluxo publicado.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (input: { accessKey?: string; purchaseOrder?: string }) => {
      if (!companyId || !configId) throw new Error('Configuração inválida');
      return testFlowConfig(orgId, companyId, configId, input);
    },
  });

  const handleAddStep = useCallback(
    (
      stepKey: string,
      name: string,
      position: { x: number; y: number },
    ) => {
      const currentConfig = useFlowEditorStore.getState().config;
      if (!currentConfig) return;

      const lib = STEP_LIBRARY.find(
        (s) => s.stepKey === stepKey && s.name === name,
      );
      const id = crypto.randomUUID();
      const sequence = currentConfig.steps.length + 1;
      const newStep: FlowStepDto = {
        id,
        flowConfigId: currentConfig.id,
        stepKey,
        name,
        sequence,
        active: true,
        type: lib?.type ?? 'action',
        config: { ...(lib?.defaultConfig ?? {}) },
        positionX: position.x,
        positionY: position.y,
      };
      const nextSteps = [...currentConfig.steps, newStep];
      appendStep(newStep, buildAutoEdges(nextSteps));
      useFlowEditorStore.getState().selectStep(id);
      toast.success(`Etapa "${name}" adicionada ao fluxo.`);
    },
    [appendStep],
  );

  const companies =
    companiesData?.items.map((c) => ({
      id: c.id,
      razaoSocial: c.razaoSocial,
    })) ?? [];

  if (!orgId) {
    return (
      <div className='text-muted-foreground flex min-h-[400px] items-center justify-center text-sm'>
        Selecione uma organização para configurar o fluxo.
      </div>
    );
  }

  return (
    <div className='flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-lg border'>
      <FlowHeader
        companies={companies}
        companyId={companyId}
        model={model}
        configs={listData?.items ?? []}
        activeConfigId={configId}
        flowActive={config?.active ?? false}
        onCompanyChange={(id) => {
          setCompanyId(id);
          setConfigId(null);
          setConfig(null);
        }}
        onModelChange={(m) => {
          setModel(m);
          setConfigId(null);
          setConfig(null);
        }}
        onConfigChange={(id) => setConfigId(id)}
        onFlowActiveChange={(active) => patchConfig({ active })}
        onPublish={() => publishMutation.mutate()}
        isPublishing={publishMutation.isPending}
      />

      <div className='grid min-h-0 flex-1 grid-cols-[260px_1fr_320px] overflow-hidden'>
        <div className='min-h-0 overflow-hidden'>
          <StepLibrary />
        </div>
        <div className='min-h-0 overflow-hidden'>
          <FlowCanvas onAddStepFromLibrary={handleAddStep} />
        </div>
        <div className='min-h-0 overflow-hidden'>
          <StepConfigPanel />
        </div>
      </div>

      <FlowFooterActions
        config={config}
        isDirty={isDirty}
        isSaving={saveMutation.isPending}
        isPublishing={publishMutation.isPending}
        onSaveDraft={() => saveMutation.mutate()}
        onTestFlow={() => setTestOpen(true)}
        onPublish={() => publishMutation.mutate()}
        onShowHistory={() => setHistoryOpen(true)}
      />

      <TestFlowDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        onTest={(input) => testMutation.mutateAsync(input)}
        isLoading={testMutation.isPending}
      />

      <FlowVersionHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        organizationId={orgId}
        companyId={companyId ?? ''}
        configId={configId}
      />
    </div>
  );
}
