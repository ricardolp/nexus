import { CrudRepository } from '@nexus/shared';
import { OrganizationCompany } from '../model';

export interface OrganizationCompanyPageParams {
  page: number;
  perPage: number;
  organizationId: string;
}

export interface OrganizationCompanyRepository
  extends CrudRepository<
    OrganizationCompany,
    OrganizationCompany,
    OrganizationCompany,
    OrganizationCompanyPageParams
  > {
  findByCnpj(cnpj: string): Promise<OrganizationCompany | null>;
}
