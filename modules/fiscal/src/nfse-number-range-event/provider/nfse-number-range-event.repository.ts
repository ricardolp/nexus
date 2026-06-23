import { CrudRepository } from '@nexus/shared';
import { NfseNumberRangeEvent } from '../model';

export interface NfseNumberRangeEventPageParams {
  numberRangeId?: string;
  page: number;
  perPage: number;
}

export interface NfseNumberRangeEventRepository
  extends CrudRepository<
    NfseNumberRangeEvent,
    NfseNumberRangeEvent,
    NfseNumberRangeEvent,
    NfseNumberRangeEventPageParams
  > {
  
}
