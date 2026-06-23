import { CrudRepository } from '@nexus/shared';
import { EmailLog } from '../model';

export interface EmailLogPageParams {
  page: number;
  perPage: number;
}

export interface EmailLogRepository
  extends CrudRepository<EmailLog, EmailLog, EmailLog, EmailLogPageParams> {}
