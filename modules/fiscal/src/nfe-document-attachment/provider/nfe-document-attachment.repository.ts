import { CrudRepository } from '@nexus/shared';
import { NfeDocumentAttachment } from '../model';

export interface NfeDocumentAttachmentPageParams {
  documentId?: string;
  eventId?: string;
  page: number;
  perPage: number;
}

export interface NfeDocumentAttachmentRepository
  extends CrudRepository<
    NfeDocumentAttachment,
    NfeDocumentAttachment,
    NfeDocumentAttachment,
    NfeDocumentAttachmentPageParams
  > {
  findByDocumentId(documentId: string): Promise<NfeDocumentAttachment[]>;
  findByEventId(eventId: string): Promise<NfeDocumentAttachment[]>;
}
