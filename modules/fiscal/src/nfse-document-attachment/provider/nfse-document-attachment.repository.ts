import { CrudRepository } from '@nexus/shared';
import { NfseDocumentAttachment } from '../model';

export interface NfseDocumentAttachmentPageParams {
  documentId?: string;
  eventId?: string;
  page: number;
  perPage: number;
}

export interface NfseDocumentAttachmentRepository
  extends CrudRepository<
    NfseDocumentAttachment,
    NfseDocumentAttachment,
    NfseDocumentAttachment,
    NfseDocumentAttachmentPageParams
  > {
  findByDocumentId(documentId: string): Promise<NfseDocumentAttachment[]>;
  findByEventId(eventId: string): Promise<NfseDocumentAttachment[]>;
}
