import { PageResult } from '@nexus/shared';
import { OrganizationCompany } from '../../src/organization-company/model';
import {
  OrganizationCompanyPageParams,
  OrganizationCompanyRepository,
} from '../../src/organization-company/provider';

export class FakeOrganizationCompanyRepository
  implements OrganizationCompanyRepository
{
  private readonly items = new Map<string, OrganizationCompany>();

  async create(data: OrganizationCompany): Promise<OrganizationCompany> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: OrganizationCompany): Promise<OrganizationCompany> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<OrganizationCompany | null> {
    return this.items.get(id) ?? null;
  }

  async findByCnpj(cnpj: string): Promise<OrganizationCompany | null> {
    const normalized = cnpj.replace(/\D/g, '');

    return (
      Array.from(this.items.values()).find(
        (item) => item.cnpj.replace(/\D/g, '') === normalized,
      ) ?? null
    );
  }

  async findPage(
    params: OrganizationCompanyPageParams,
  ): Promise<PageResult<OrganizationCompany>> {
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
