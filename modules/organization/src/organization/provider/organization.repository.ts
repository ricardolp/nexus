import { CrudRepository } from '@nexus/shared';
import { Organization } from '../model';

export interface OrganizationPageParams {
  page: number;
  perPage: number;
}

export interface OrganizationRepository
  extends CrudRepository<
    Organization,
    Organization,
    Organization,
    OrganizationPageParams
  > {
  findBySlug(slug: string): Promise<Organization | null>;
}
