export type FlowConfigStatus = 'draft' | 'published' | 'archived';
export type FlowStepType = 'validation' | 'action' | 'wait' | 'approval';
export type FlowEdgeCondition = 'success' | 'error' | 'wait' | 'manual' | 'status_ok';

export interface FlowConfigSummary {
  id: string;
  organizationId: string;
  companyId: string | null;
  model: string;
  name: string;
  version: string;
  active: boolean;
  status: FlowConfigStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowStepDto {
  id: string;
  flowConfigId: string;
  stepKey: string;
  name: string;
  sequence: number;
  active: boolean;
  type: FlowStepType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export interface FlowEdgeDto {
  id: string;
  flowConfigId: string;
  sourceStepId: string;
  targetStepId: string;
  conditionType: FlowEdgeCondition;
  conditionExpression: Record<string, unknown> | null;
}

export interface FlowConfigFull extends FlowConfigSummary {
  steps: FlowStepDto[];
  edges: FlowEdgeDto[];
}

export interface FlowConfigListResponse {
  items: FlowConfigSummary[];
  page: number;
  perPage: number;
  total: number;
}

export interface FlowAuditLogDto {
  id: string;
  flowConfigId: string;
  version: string;
  userId: string | null;
  action: string;
  stepKey: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface FlowAuditListResponse {
  items: FlowAuditLogDto[];
  page: number;
  perPage: number;
  total: number;
}

export interface TestFlowResult {
  success: boolean;
  steps: Array<{
    step: string;
    status: string;
    message: string;
  }>;
}

export interface SaveFlowDraftPayload {
  name?: string;
  active?: boolean;
  steps: Array<{
    id?: string;
    stepKey: string;
    name: string;
    sequence: number;
    active: boolean;
    type: FlowStepType;
    config: Record<string, unknown>;
    positionX: number;
    positionY: number;
  }>;
  edges: Array<{
    id?: string;
    sourceStepId: string;
    targetStepId: string;
    conditionType: FlowEdgeCondition;
    conditionExpression?: Record<string, unknown> | null;
  }>;
}
