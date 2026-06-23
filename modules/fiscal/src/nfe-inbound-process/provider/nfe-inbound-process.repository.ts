import { CrudRepository } from '@nexus/shared';
import { NfeInboundProcess } from '../model';

export interface NfeInboundProcessPageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfeInboundProcessRepository
  extends CrudRepository<
    NfeInboundProcess,
    NfeInboundProcess,
    NfeInboundProcess,
    NfeInboundProcessPageParams
  > {
  findByDocumentId(documentId: string): Promise<NfeInboundProcess | null>;
}
