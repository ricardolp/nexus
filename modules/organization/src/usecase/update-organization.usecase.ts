import {
  ForbiddenError,
  NotFoundError,
  UseCase,
  ValidationError,
} from '@nexus/shared';
import { Organization } from '../organization/model';
import { OrganizationRepository } from '../organization/provider';

export interface UpdateOrganizationIn {
  organizationId: string;
  nome?: string;
  slug?: string;
  logo?: string | null;
  actorRole: string;
}

export class UpdateOrganization
  implements UseCase<UpdateOrganizationIn, Organization>
{
  constructor(
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: UpdateOrganizationIn): Promise<Organization> {
    if (input.actorRole !== 'admin') {
      throw new ForbiddenError(
        'Somente administradores podem alterar organizações',
      );
    }

    const organization = await this.organizationRepository.findById(
      input.organizationId,
    );

    if (!organization) {
      throw new NotFoundError('Organização não encontrada');
    }

    if (
      input.nome === undefined &&
      input.slug === undefined &&
      input.logo === undefined
    ) {
      throw new ValidationError('Nenhum campo para atualizar');
    }

    if (input.slug !== undefined && input.slug !== organization.slug) {
      const existing = await this.organizationRepository.findBySlug(input.slug);
      if (existing && existing.id !== organization.id) {
        throw new ValidationError('Slug já utilizado');
      }
    }

    const updated = organization.clone({
      nome: input.nome ?? organization.nome,
      slug: input.slug ?? organization.slug,
      logo: input.logo !== undefined ? input.logo : organization.logo,
    });

    updated.validate();
    return this.organizationRepository.update(updated);
  }
}
