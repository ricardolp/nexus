import { NotFoundError, UseCase } from '@nexus/shared';
import { NfeFlowAuditLogPageParams, NfeFlowAuditLogRepository } from '../provider';
import { PageResult } from '@nexus/shared';
import { NfeFlowAuditLog } from '../model';

export class GetFlowConfigHistory
  implements UseCase<NfeFlowAuditLogPageParams, PageResult<NfeFlowAuditLog>>
{
  constructor(private readonly repository: NfeFlowAuditLogRepository) {}

  execute(input: NfeFlowAuditLogPageParams) {
    return this.repository.findPage(input);
  }
}

export interface GetFlowConfigHistoryIn {
  flowConfigId: string;
  page: number;
  perPage: number;
}
