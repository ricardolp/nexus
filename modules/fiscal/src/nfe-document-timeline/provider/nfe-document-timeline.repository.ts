import { CrudRepository } from '@nexus/shared';
import { NfeDocumentTimeline } from '../model';

export interface NfeDocumentTimelinePageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfeDocumentTimelineRepository
  extends CrudRepository<
    NfeDocumentTimeline,
    NfeDocumentTimeline,
    NfeDocumentTimeline,
    NfeDocumentTimelinePageParams
  > {
  findByDocumentId(documentId: string): Promise<NfeDocumentTimeline[]>;
}
