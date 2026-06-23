import { PageResult } from '@nexus/shared';
import { Organization } from '../../src/organization/model';
import {
  OrganizationPageParams,
  OrganizationRepository,
} from '../../src/organization/provider';

export class FakeOrganizationRepository implements OrganizationRepository {
  private readonly items = new Map<string, Organization>();

  async create(data: Organization): Promise<Organization> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: Organization): Promise<Organization> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<Organization | null> {
    return this.items.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return (
      Array.from(this.items.values()).find((item) => item.slug === slug) ?? null
    );
  }

  async findPage(
    params: OrganizationPageParams,
  ): Promise<PageResult<Organization>> {
    const all = Array.from(this.items.values());
    const start = (params.page - 1) * params.perPage;

    return {
      items: all.slice(start, start + params.perPage),
      page: params.page,
      perPage: params.perPage,
      total: all.length,
    };
  }
}
