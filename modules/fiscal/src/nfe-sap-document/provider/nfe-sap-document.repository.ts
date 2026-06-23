import { CrudRepository } from '@nexus/shared';
import { FiscalNfeSapDocumentType } from '../../shared/fiscal-nfe-sap-document-type';
import { NfeSapDocument } from '../model';

export interface NfeSapDocumentPageParams {
  documentId?: string;
  page: number;
  perPage: number;
}

export interface NfeSapDocumentRepository
  extends CrudRepository<
    NfeSapDocument,
    NfeSapDocument,
    NfeSapDocument,
    NfeSapDocumentPageParams
  > {
  findByDocumentIdAndType(documentId: string, documentType: FiscalNfeSapDocumentType): Promise<NfeSapDocument[]>;
}
