import { CrudRepository } from '@nexus/shared';
import { NfeDocumentItem } from '../model';

export interface NfeDocumentItemPageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfeDocumentItemRepository
  extends CrudRepository<
    NfeDocumentItem,
    NfeDocumentItem,
    NfeDocumentItem,
    NfeDocumentItemPageParams
  > {
  findByDocumentId(documentId: string): Promise<NfeDocumentItem[]>;
}
