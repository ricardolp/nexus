import { CrudRepository } from '@nexus/shared';
import { FiscalNfseEnvironment } from '../../shared/fiscal-nfse-environment';
import { NfseNumberRange } from '../model';

export interface NfseNumberRangePageParams {
  organizationId: string;
  companyId?: string;
  page: number;
  perPage: number;
}

export interface NfseNumberRangeRepository
  extends CrudRepository<
    NfseNumberRange,
    NfseNumberRange,
    NfseNumberRange,
    NfseNumberRangePageParams
  > {
  findByCompanyEnvSeries(companyId: string, environment: FiscalNfseEnvironment, series: number): Promise<NfseNumberRange[]>;
}
