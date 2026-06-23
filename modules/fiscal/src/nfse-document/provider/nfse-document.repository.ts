import { CrudRepository } from '@nexus/shared';
import { FiscalDocumentDirection } from '../../shared/fiscal-document-direction';
import { NfseDocument } from '../model';

export interface NfseDocumentPageParams {
  organizationId: string;
  companyId?: string;
  direction?: FiscalDocumentDirection;
  page: number;
  perPage: number;
}

export interface NfseDocumentRepository
  extends CrudRepository<NfseDocument, NfseDocument, NfseDocument, NfseDocumentPageParams> {
  findByAccessKey(accessKey: string): Promise<NfseDocument | null>;
  findByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<NfseDocument | null>;
}
