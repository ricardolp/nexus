import { UseCase } from '@nexus/shared';
import { OrganizationRepository } from '../organization/provider';
import { OrganizationMemberRepository } from '../organization-member/provider';
import { OrganizationRoleRepository } from '../organization-role/provider';

export interface ListMyOrganizationsIn {
  userId: string;
  actorRole: string;
}

export interface MyOrganizationRole {
  id: string;
  nome: string;
  slug: string;
}

export interface MyOrganizationItem {
  id: string;
  nome: string;
  slug: string;
  role: MyOrganizationRole | null;
}

export interface ListMyOrganizationsOut {
  items: MyOrganizationItem[];
}

export class ListMyOrganizations
  implements UseCase<ListMyOrganizationsIn, ListMyOrganizationsOut>
{
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly organizationRoleRepository: OrganizationRoleRepository,
  ) {}

  async execute(
    input: ListMyOrganizationsIn,
  ): Promise<ListMyOrganizationsOut> {
    if (input.actorRole === 'admin') {
      const result = await this.organizationRepository.findPage({
        page: 1,
        perPage: 1000,
      });

      return {
        items: result.items.map((organization) => ({
          id: organization.id,
          nome: organization.nome,
          slug: organization.slug,
          role: null,
        })),
      };
    }

    const memberships =
      await this.organizationMemberRepository.findByUserId(input.userId);

    const items = await Promise.all(
      memberships.map(async (membership) => {
        const [organization, role] = await Promise.all([
          this.organizationRepository.findById(membership.organizationId),
          this.organizationRoleRepository.findById(membership.roleId),
        ]);

        if (!organization) {
          return null;
        }

        return {
          id: organization.id,
          nome: organization.nome,
          slug: organization.slug,
          role: role
            ? {
                id: role.id,
                nome: role.nome,
                slug: role.slug,
              }
            : null,
        };
      }),
    );

    return {
      items: items.filter(
        (item): item is MyOrganizationItem => item !== null,
      ),
    };
  }
}
