import { CrudRepository } from '@nexus/shared';
import { NfeFlowConfig, NfeFlowEdge, NfeFlowStep } from '../model';

export interface NfeFlowConfigPageParams {
  organizationId: string;
  companyId?: string | null;
  model?: string;
  page: number;
  perPage: number;
}

export interface NfeFlowConfigFull {
  config: NfeFlowConfig;
  steps: NfeFlowStep[];
  edges: NfeFlowEdge[];
}

export interface SaveFlowConfigDraftInput {
  config: NfeFlowConfig;
  steps: NfeFlowStep[];
  edges: NfeFlowEdge[];
}

export interface NfeFlowConfigRepository
  extends CrudRepository<
    NfeFlowConfig,
    NfeFlowConfig,
    NfeFlowConfig,
    NfeFlowConfigPageParams
  > {
  findActivePublished(
    organizationId: string,
    companyId: string | null,
    model: string,
  ): Promise<NfeFlowConfigFull | null>;

  findFullById(id: string): Promise<NfeFlowConfigFull | null>;

  saveDraft(input: SaveFlowConfigDraftInput): Promise<NfeFlowConfigFull>;

  findPublishedByScope(
    organizationId: string,
    companyId: string | null,
    model: string,
  ): Promise<NfeFlowConfig | null>;

  archivePublishedByScope(
    organizationId: string,
    companyId: string | null,
    model: string,
    excludeId?: string,
  ): Promise<void>;
}
