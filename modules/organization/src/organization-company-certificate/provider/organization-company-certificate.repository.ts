import { CrudRepository } from '@nexus/shared';
import { OrganizationCompanyCertificate } from '../model';

export interface OrganizationCompanyCertificatePageParams {
  page: number;
  perPage: number;
  organizationId: string;
  companyId: string;
}

export interface OrganizationCompanyCertificateRepository
  extends CrudRepository<
    OrganizationCompanyCertificate,
    OrganizationCompanyCertificate,
    OrganizationCompanyCertificate,
    OrganizationCompanyCertificatePageParams
  > {
  findByCompanyId(
    companyId: string,
  ): Promise<OrganizationCompanyCertificate[]>;
  findActiveByCompanyId(
    companyId: string,
  ): Promise<OrganizationCompanyCertificate | null>;
  deactivateAllByCompanyId(
    companyId: string,
    exceptId?: string,
  ): Promise<void>;
}
