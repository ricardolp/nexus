import { OrganizationSettings } from '../../src/organization-settings/model';
import { OrganizationSettingsRepository } from '../../src/organization-settings/provider';

export class FakeOrganizationSettingsRepository
  implements OrganizationSettingsRepository
{
  private readonly items = new Map<string, OrganizationSettings>();

  async create(data: OrganizationSettings): Promise<OrganizationSettings> {
    this.items.set(data.organizationId, data);
    return data;
  }

  async update(data: OrganizationSettings): Promise<OrganizationSettings> {
    this.items.set(data.organizationId, data);
    return data;
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationSettings | null> {
    return this.items.get(organizationId) ?? null;
  }
}
