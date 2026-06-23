import { PageResult } from '@nexus/shared';
import { OrganizationMember } from '../../src/organization-member/model';
import {
  OrganizationMemberPageParams,
  OrganizationMemberRepository,
} from '../../src/organization-member/provider';

export class FakeOrganizationMemberRepository
  implements OrganizationMemberRepository
{
  private readonly items = new Map<string, OrganizationMember>();

  async create(data: OrganizationMember): Promise<OrganizationMember> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: OrganizationMember): Promise<OrganizationMember> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<OrganizationMember | null> {
    return this.items.get(id) ?? null;
  }

  async findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    return (
      Array.from(this.items.values()).find(
        (item) =>
          item.organizationId === organizationId && item.userId === userId,
      ) ?? null
    );
  }

  async findByUserId(userId: string): Promise<OrganizationMember[]> {
    return Array.from(this.items.values()).filter(
      (item) => item.userId === userId,
    );
  }

  async findPage(
    params: OrganizationMemberPageParams,
  ): Promise<PageResult<OrganizationMember>> {
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
