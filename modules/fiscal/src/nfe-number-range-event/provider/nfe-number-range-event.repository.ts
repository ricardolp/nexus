import { CrudRepository } from '@nexus/shared';
import { NfeNumberRangeEvent } from '../model';

export interface NfeNumberRangeEventPageParams {
  numberRangeId?: string;
  page: number;
  perPage: number;
}

export interface NfeNumberRangeEventRepository
  extends CrudRepository<
    NfeNumberRangeEvent,
    NfeNumberRangeEvent,
    NfeNumberRangeEvent,
    NfeNumberRangeEventPageParams
  > {
  
}
