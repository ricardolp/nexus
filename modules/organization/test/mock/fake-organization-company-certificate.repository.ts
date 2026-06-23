import { PageResult } from '@nexus/shared';
import { OrganizationCompanyCertificate } from '../../src/organization-company-certificate/model';
import {
  OrganizationCompanyCertificatePageParams,
  OrganizationCompanyCertificateRepository,
} from '../../src/organization-company-certificate/provider';

export class FakeOrganizationCompanyCertificateRepository
  implements OrganizationCompanyCertificateRepository
{
  private readonly items = new Map<string, OrganizationCompanyCertificate>();

  async create(
    data: OrganizationCompanyCertificate,
  ): Promise<OrganizationCompanyCertificate> {
    this.items.set(data.id, data);
    return data;
  }

  async update(
    data: OrganizationCompanyCertificate,
  ): Promise<OrganizationCompanyCertificate> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      this.items.set(id, item.clone({ deletedAt: new Date() }));
    }
  }

  async findById(id: string): Promise<OrganizationCompanyCertificate | null> {
    const item = this.items.get(id);
    if (!item || item.deletedAt) {
      return null;
    }
    return item;
  }

  async findByCompanyId(
    companyId: string,
  ): Promise<OrganizationCompanyCertificate[]> {
    return Array.from(this.items.values()).filter(
      (item) => item.companyId === companyId && !item.deletedAt,
    );
  }

  async findActiveByCompanyId(
    companyId: string,
  ): Promise<OrganizationCompanyCertificate | null> {
    return (
      Array.from(this.items.values()).find(
        (item) =>
          item.companyId === companyId &&
          item.status === 'active' &&
          !item.deletedAt,
      ) ?? null
    );
  }

  async deactivateAllByCompanyId(
    companyId: string,
    exceptId?: string,
  ): Promise<void> {
    for (const [id, item] of this.items.entries()) {
      if (
        item.companyId === companyId &&
        item.status === 'active' &&
        !item.deletedAt &&
        id !== exceptId
      ) {
        this.items.set(id, item.clone({ status: 'inactive' }));
      }
    }
  }

  async findPage(
    params: OrganizationCompanyCertificatePageParams,
  ): Promise<PageResult<OrganizationCompanyCertificate>> {
    const all = Array.from(this.items.values()).filter(
      (item) =>
        item.organizationId === params.organizationId &&
        item.companyId === params.companyId &&
        !item.deletedAt,
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
