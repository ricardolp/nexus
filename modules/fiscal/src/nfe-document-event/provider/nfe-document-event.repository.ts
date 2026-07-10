import { CrudRepository } from '@nexus/shared';
import { NfeDocumentEvent } from '../model';

export interface NfeDocumentEventPageParams {
  organizationId: string;
  documentId?: string;
  page: number;
  perPage: number;
  eventType?: string;
  eventStatus?: string;
  search?: string;
}

export interface NfeDocumentEventRepository
  extends CrudRepository<
    NfeDocumentEvent,
    NfeDocumentEvent,
    NfeDocumentEvent,
    NfeDocumentEventPageParams
  > {}
