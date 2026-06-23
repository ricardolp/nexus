import { CrudRepository } from '@nexus/shared';
import { NfseInboundProcess } from '../model';

export interface NfseInboundProcessPageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfseInboundProcessRepository
  extends CrudRepository<
    NfseInboundProcess,
    NfseInboundProcess,
    NfseInboundProcess,
    NfseInboundProcessPageParams
  > {
  findByDocumentId(documentId: string): Promise<NfseInboundProcess | null>;
}
