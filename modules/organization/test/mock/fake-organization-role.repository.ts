import { PageResult } from '@nexus/shared';
import { OrganizationRole } from '../../src/organization-role/model';
import {
  OrganizationRolePageParams,
  OrganizationRoleRepository,
} from '../../src/organization-role/provider';

export class FakeOrganizationRoleRepository
  implements OrganizationRoleRepository
{
  private readonly items = new Map<string, OrganizationRole>();

  async create(data: OrganizationRole): Promise<OrganizationRole> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: OrganizationRole): Promise<OrganizationRole> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<OrganizationRole | null> {
    return this.items.get(id) ?? null;
  }

  async findByOrganizationAndSlug(
    organizationId: string,
    slug: string,
  ): Promise<OrganizationRole | null> {
    return (
      Array.from(this.items.values()).find(
        (item) => item.organizationId === organizationId && item.slug === slug,
      ) ?? null
    );
  }

  async findPage(
    params: OrganizationRolePageParams,
  ): Promise<PageResult<OrganizationRole>> {
    const all = Array.from(this.items.values()).filter(
      (item) => item.organizationId === params.organizationId,
    );
    const start = (params.page - 1) * params.perPage;

    return {
      items: all.slice(start, start + params.perPage),
      page: params.page,
      perPage: params.perPage,
      total: all.length,
    };
  }
}
