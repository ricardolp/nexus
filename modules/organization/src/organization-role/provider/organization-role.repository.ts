import { CrudRepository } from '@nexus/shared';
import { OrganizationRole } from '../model';

export interface OrganizationRolePageParams {
  page: number;
  perPage: number;
  organizationId: string;
}

export interface OrganizationRoleRepository
  extends CrudRepository<
    OrganizationRole,
    OrganizationRole,
    OrganizationRole,
    OrganizationRolePageParams
  > {
  findByOrganizationAndSlug(
    organizationId: string,
    slug: string,
  ): Promise<OrganizationRole | null>;
}
