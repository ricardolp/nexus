import { create } from 'zustand';
import type { FlowConfigFull, FlowEdgeDto, FlowStepDto } from '../api/types';

interface FlowEditorState {
  config: FlowConfigFull | null;
  selectedStepId: string | null;
  isDirty: boolean;
  setConfig: (config: FlowConfigFull | null) => void;
  selectStep: (stepId: string | null) => void;
  updateStep: (stepId: string, patch: Partial<FlowStepDto>) => void;
  addStep: (step: FlowStepDto) => void;
  removeStep: (stepId: string) => void;
  setSteps: (steps: FlowStepDto[]) => void;
  setEdges: (edges: FlowEdgeDto[]) => void;
  patchConfig: (patch: Partial<FlowConfigFull>) => void;
  appendStep: (step: FlowStepDto, edges: FlowEdgeDto[]) => void;
  markClean: () => void;
}

export const useFlowEditorStore = create<FlowEditorState>((set) => ({
  config: null,
  selectedStepId: null,
  isDirty: false,
  setConfig: (config) => set({ config, selectedStepId: null, isDirty: false }),
  selectStep: (selectedStepId) => set({ selectedStepId }),
  updateStep: (stepId, patch) =>
    set((state) => {
      if (!state.config) return state;
      return {
        isDirty: true,
        config: {
          ...state.config,
          steps: state.config.steps.map((s) =>
            s.id === stepId ? { ...s, ...patch } : s,
          ),
        },
      };
    }),
  addStep: (step) =>
    set((state) => {
      if (!state.config) return state;
      return {
        isDirty: true,
        config: {
          ...state.config,
          steps: [...state.config.steps, step],
        },
      };
    }),
  removeStep: (stepId) =>
    set((state) => {
      if (!state.config) return state;
      return {
        isDirty: true,
        selectedStepId:
          state.selectedStepId === stepId ? null : state.selectedStepId,
        config: {
          ...state.config,
          steps: state.config.steps.filter((s) => s.id !== stepId),
          edges: state.config.edges.filter(
            (e) => e.sourceStepId !== stepId && e.targetStepId !== stepId,
          ),
        },
      };
    }),
  setSteps: (steps) =>
    set((state) => {
      if (!state.config) return state;
      return { isDirty: true, config: { ...state.config, steps } };
    }),
  setEdges: (edges) =>
    set((state) => {
      if (!state.config) return state;
      return { isDirty: true, config: { ...state.config, edges } };
    }),
  patchConfig: (patch) =>
    set((state) => {
      if (!state.config) return state;
      return { isDirty: true, config: { ...state.config, ...patch } };
    }),
  appendStep: (step, edges) =>
    set((state) => {
      if (!state.config) return state;
      return {
        isDirty: true,
        config: {
          ...state.config,
          steps: [...state.config.steps, step],
          edges,
        },
      };
    }),
  markClean: () => set({ isDirty: false }),
}));
