import { CrudRepository } from '@nexus/shared';
import { NfseDocumentItem } from '../model';

export interface NfseDocumentItemPageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfseDocumentItemRepository
  extends CrudRepository<
    NfseDocumentItem,
    NfseDocumentItem,
    NfseDocumentItem,
    NfseDocumentItemPageParams
  > {
  findByDocumentId(documentId: string): Promise<NfseDocumentItem[]>;
}
