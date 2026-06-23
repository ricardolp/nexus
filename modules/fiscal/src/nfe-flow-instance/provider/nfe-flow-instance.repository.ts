import { CrudRepository } from '@nexus/shared';
import { NfeFlowInstance, NfeFlowStepExecution } from '../model';

export interface NfeFlowInstancePageParams {
  flowConfigId?: string;
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfeFlowInstanceFull {
  instance: NfeFlowInstance;
  executions: NfeFlowStepExecution[];
}

export interface NfeFlowInstanceRepository
  extends CrudRepository<
    NfeFlowInstance,
    NfeFlowInstance,
    NfeFlowInstance,
    NfeFlowInstancePageParams
  > {
  findByDocumentId(documentId: string): Promise<NfeFlowInstanceFull | null>;
  findFullById(id: string): Promise<NfeFlowInstanceFull | null>;
  saveWithExecutions(
    instance: NfeFlowInstance,
    executions: NfeFlowStepExecution[],
  ): Promise<NfeFlowInstanceFull>;
}

export interface NfeFlowStepExecutionRepository
  extends CrudRepository<
    NfeFlowStepExecution,
    NfeFlowStepExecution,
    NfeFlowStepExecution,
    { instanceId: string; page: number; perPage: number }
  > {}
