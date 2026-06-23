import { CrudRepository } from '@nexus/shared';
import { OrganizationMember } from '../model';

export interface OrganizationMemberPageParams {
  page: number;
  perPage: number;
  organizationId: string;
}

export interface OrganizationMemberRepository
  extends CrudRepository<
    OrganizationMember,
    OrganizationMember,
    OrganizationMember,
    OrganizationMemberPageParams
  > {
  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null>;

  findByUserId(userId: string): Promise<OrganizationMember[]>;
}
