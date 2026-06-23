import { CrudRepository } from '@nexus/shared';
import { NfseDocumentEvent } from '../model';

export interface NfseDocumentEventPageParams {
  organizationId: string;
  documentId: string;
  page: number;
  perPage: number;
}

export interface NfseDocumentEventRepository
  extends CrudRepository<
    NfseDocumentEvent,
    NfseDocumentEvent,
    NfseDocumentEvent,
    NfseDocumentEventPageParams
  > {}
