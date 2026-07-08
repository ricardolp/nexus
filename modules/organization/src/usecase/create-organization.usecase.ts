import {
  ALL_ORG_ROLE_PERMISSIONS,
  DEFAULT_ORGANIZATION_TI_ROLE,
  ForbiddenError,
  UseCase,
  ValidationError,
} from '@nexus/shared';
import { Organization } from '../organization/model';
import { OrganizationRepository } from '../organization/provider';
import { OrganizationRole } from '../organization-role/model';
import { OrganizationRoleRepository } from '../organization-role/provider';
import { OrganizationRolePermissionRepository } from '../organization-role-permission/provider';
import {
  DEFAULT_ORGANIZATION_MAX_COMPANIES,
  OrganizationSettings,
} from '../organization-settings/model';
import { OrganizationSettingsRepository } from '../organization-settings/provider';

export interface CreateOrganizationIn {
  nome: string;
  slug: string;
  logo?: string | null;
  actorRole: string;
}

export class CreateOrganization implements UseCase<CreateOrganizationIn, Organization> {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    private readonly organizationRoleRepository: OrganizationRoleRepository,
    private readonly organizationRolePermissionRepository: OrganizationRolePermissionRepository,
  ) {}

  async execute(input: CreateOrganizationIn): Promise<Organization> {
    if (input.actorRole !== 'admin') {
      throw new ForbiddenError('Somente administradores podem criar organizações');
    }

    const existing = await this.organizationRepository.findBySlug(input.slug);
    if (existing) {
      throw new ValidationError('Slug já utilizado');
    }

    const organization = new Organization({
      nome: input.nome,
      slug: input.slug,
      logo: input.logo ?? null,
    });

    organization.validate();
    const created = await this.organizationRepository.create(organization);

    const settings = new OrganizationSettings({
      organizationId: created.id,
      maxCompanies: DEFAULT_ORGANIZATION_MAX_COMPANIES,
    });

    settings.validate();
    await this.organizationSettingsRepository.create(settings);

    const tiRole = new OrganizationRole({
      organizationId: created.id,
      nome: DEFAULT_ORGANIZATION_TI_ROLE.nome,
      slug: DEFAULT_ORGANIZATION_TI_ROLE.slug,
    });

    tiRole.validate();
    const createdRole = await this.organizationRoleRepository.create(tiRole);

    await this.organizationRolePermissionRepository.replaceRolePermissions(
      createdRole.id,
      [...ALL_ORG_ROLE_PERMISSIONS],
    );

    return created;
  }
}
