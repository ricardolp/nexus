import { UseCase, ValidationError } from '@nexus/shared';
import { OrganizationRole } from '../organization-role/model';
import { OrganizationRoleRepository } from '../organization-role/provider';

export interface CreateOrganizationRoleIn {
  organizationId: string;
  nome: string;
  slug: string;
}

export class CreateOrganizationRole
  implements UseCase<CreateOrganizationRoleIn, OrganizationRole>
{
  constructor(
    private readonly organizationRoleRepository: OrganizationRoleRepository,
  ) {}

  async execute(input: CreateOrganizationRoleIn): Promise<OrganizationRole> {
    const existing =
      await this.organizationRoleRepository.findByOrganizationAndSlug(
        input.organizationId,
        input.slug,
      );

    if (existing) {
      throw new ValidationError('Slug de role já utilizado nesta organização');
    }

    const role = new OrganizationRole({
      organizationId: input.organizationId,
      nome: input.nome,
      slug: input.slug,
    });

    role.validate();
    return this.organizationRoleRepository.create(role);
  }
}
