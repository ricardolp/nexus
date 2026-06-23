'use client';

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type Node,
  type OnNodesChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useState } from 'react';
import type { FlowEdgeDto, FlowStepDto } from '../api/types';
import { parseDroppedStepData } from '../constants/drag-payload';
import { useFlowEditorStore } from '../hooks/use-flow-editor-store';
import { StepNode, type StepNodeData } from './step-node';

const nodeTypes = { stepNode: StepNode };

const EDGE_COLORS: Record<string, string> = {
  success: '#3b82f6',
  error: '#ef4444',
  wait: '#f97316',
  status_ok: '#f97316',
  manual: '#6b7280',
};

interface FlowCanvasProps {
  onAddStepFromLibrary?: (
    stepKey: string,
    name: string,
    position: { x: number; y: number },
  ) => void;
}

function FlowCanvasInner({ onAddStepFromLibrary }: FlowCanvasProps) {
  const config = useFlowEditorStore((s) => s.config);
  const selectedStepId = useFlowEditorStore((s) => s.selectedStepId);
  const selectStep = useFlowEditorStore((s) => s.selectStep);
  const removeStep = useFlowEditorStore((s) => s.removeStep);
  const setSteps = useFlowEditorStore((s) => s.setSteps);
  const { screenToFlowPosition } = useReactFlow();

  const buildNodes = useCallback(
    (steps: FlowStepDto[]): Node<StepNodeData>[] =>
      [...steps]
        .sort((a, b) => a.sequence - b.sequence)
        .map((step, index) => ({
          id: step.id,
          type: 'stepNode',
          position: { x: step.positionX || 100, y: step.positionY || index * 140 },
          data: {
            sequence: index + 1,
            title: step.name,
            active: step.active,
            selected: step.id === selectedStepId,
            badges: getStepBadges(step),
            onConfigure: () => selectStep(step.id),
            onRemove: () => removeStep(step.id),
          },
        })),
    [selectedStepId, selectStep, removeStep],
  );

  const buildEdges = useCallback(
    (edges: FlowEdgeDto[]): Edge[] =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceStepId,
        target: edge.targetStepId,
        animated: edge.conditionType === 'wait' || edge.conditionType === 'status_ok',
        style: {
          stroke: EDGE_COLORS[edge.conditionType] ?? '#3b82f6',
          strokeDasharray: edge.conditionType === 'error' ? '6 4' : '4 4',
        },
        label: edge.conditionType,
      })),
    [],
  );

  const [nodes, setNodes] = useState<Node<StepNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!config) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes(buildNodes(config.steps));
    setEdges(buildEdges(config.edges));
  }, [config, buildNodes, buildEdges]);

  const onNodesChange: OnNodesChange<Node<StepNodeData>> = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      if (!config) return;

      const positionChanges = changes.filter(
        (change): change is Extract<typeof change, { type: 'position' }> =>
          change.type === 'position' &&
          'position' in change &&
          Boolean(change.position),
      );

      if (positionChanges.length === 0) return;

      const updatedSteps = config.steps.map((step) => {
        const change = positionChanges.find((c) => c.id === step.id);
        if (change?.position) {
          return {
            ...step,
            positionX: change.position.x,
            positionY: change.position.y,
          };
        }
        return step;
      });

      setSteps(updatedSteps);
    },
    [config, setSteps],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const dropped = parseDroppedStepData(event.dataTransfer);
      if (!dropped || !onAddStepFromLibrary) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onAddStepFromLibrary(dropped.stepKey, dropped.name, position);
    },
    [onAddStepFromLibrary, screenToFlowPosition],
  );

  if (!config) {
    return (
      <div className='text-muted-foreground flex h-full flex-1 items-center justify-center text-sm'>
        Selecione uma empresa e modelo para carregar o fluxo.
      </div>
    );
  }

  return (
    <div className='relative h-full min-h-0 w-full'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className='bg-muted/10'
      >
        <Background gap={16} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
      <div className='bg-background/90 pointer-events-none absolute bottom-4 left-4 rounded-lg border p-3 text-xs'>
        <div className='mb-1 font-medium'>Legenda</div>
        <div className='flex flex-col gap-1'>
          <span className='flex items-center gap-2'>
            <span className='size-3 rounded bg-green-500' /> Etapa ativa
          </span>
          <span className='flex items-center gap-2'>
            <span className='size-3 rounded border border-blue-500 border-dashed' /> Fluxo principal
          </span>
          <span className='flex items-center gap-2'>
            <span className='size-3 rounded border border-orange-500 border-dashed' /> Espera/Condição
          </span>
        </div>
      </div>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function getStepBadges(step: FlowStepDto): string[] {
  if (step.stepKey !== 'VALIDATIONS') return [];
  const badges: string[] = [];
  const cfg = step.config;
  if (cfg.validatePurchaseOrder) badges.push('validar pedido');
  if (cfg.validateTotalValue) badges.push('valor');
  if (cfg.validateItemValue) badges.push('validar item');
  if (cfg.validateSupplier) badges.push('fornecedor');
  return badges.slice(0, 4);
}
