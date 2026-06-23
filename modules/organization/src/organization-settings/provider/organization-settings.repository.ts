import { OrganizationSettings } from '../model';

export interface OrganizationSettingsRepository {
  create(data: OrganizationSettings): Promise<OrganizationSettings>;
  update(data: OrganizationSettings): Promise<OrganizationSettings>;
  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationSettings | null>;
}
