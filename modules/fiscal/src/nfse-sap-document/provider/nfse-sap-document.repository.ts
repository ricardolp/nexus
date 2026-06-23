import { CrudRepository } from '@nexus/shared';
import { FiscalNfseSapDocumentType } from '../../shared/fiscal-nfse-sap-document-type';
import { NfseSapDocument } from '../model';

export interface NfseSapDocumentPageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfseSapDocumentRepository
  extends CrudRepository<
    NfseSapDocument,
    NfseSapDocument,
    NfseSapDocument,
    NfseSapDocumentPageParams
  > {
  findByDocumentIdAndType(documentId: string, documentType: FiscalNfseSapDocumentType): Promise<NfseSapDocument[]>;
}
