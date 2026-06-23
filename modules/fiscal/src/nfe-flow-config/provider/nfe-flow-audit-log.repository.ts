import { CrudRepository } from '@nexus/shared';
import { NfeFlowAuditLog } from '../model';

export interface NfeFlowAuditLogPageParams {
  flowConfigId: string;
  page: number;
  perPage: number;
}

export interface NfeFlowAuditLogRepository
  extends CrudRepository<
    NfeFlowAuditLog,
    NfeFlowAuditLog,
    NfeFlowAuditLog,
    NfeFlowAuditLogPageParams
  > {}
