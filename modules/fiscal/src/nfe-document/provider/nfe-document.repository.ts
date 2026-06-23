import { CrudRepository } from '@nexus/shared';
import { FiscalDocumentDirection } from '../../shared/fiscal-document-direction';
import { NfeDocument } from '../model';

export interface NfeDocumentPageParams {
  organizationId: string;
  companyId?: string;
  direction?: FiscalDocumentDirection;
  search?: string;
  inboundStatus?: string;
  page: number;
  perPage: number;
}

export interface NfeDocumentRepository
  extends CrudRepository<NfeDocument, NfeDocument, NfeDocument, NfeDocumentPageParams> {
  findByAccessKey(accessKey: string): Promise<NfeDocument | null>;
  findByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<NfeDocument | null>;
}
