import { CrudRepository } from '@nexus/shared';
import { NfseDocumentTimeline } from '../model';

export interface NfseDocumentTimelinePageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfseDocumentTimelineRepository
  extends CrudRepository<
    NfseDocumentTimeline,
    NfseDocumentTimeline,
    NfseDocumentTimeline,
    NfseDocumentTimelinePageParams
  > {
  findByDocumentId(documentId: string): Promise<NfseDocumentTimeline[]>;
}
