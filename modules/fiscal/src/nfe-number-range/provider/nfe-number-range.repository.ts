import { CrudRepository } from '@nexus/shared';
import { FiscalNfeEnvironment } from '../../shared/fiscal-nfe-environment';
import { NfeNumberRange } from '../model';

export interface NfeNumberRangePageParams {
  organizationId: string;
  companyId?: string;
  page: number;
  perPage: number;
}

export interface NfeNumberRangeRepository
  extends CrudRepository<
    NfeNumberRange,
    NfeNumberRange,
    NfeNumberRange,
    NfeNumberRangePageParams
  > {
  findByCompanyEnvSeries(companyId: string, environment: FiscalNfeEnvironment, series: number): Promise<NfeNumberRange[]>;
}
