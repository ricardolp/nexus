import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@nexus/auth';
import {
  AddOrganizationMember,
  AddOrganizationMemberIn,
  CreateOrganization,
  CreateOrganizationCompany,
  CreateOrganizationCompanyIn,
  CreateOrganizationIn,
  CreateOrganizationUser,
  CreateOrganizationUserIn,
  CreateOrganizationRole,
  CreateOrganizationRoleIn,
  GetOrganization,
  GetOrganizationCompany,
  GetOrganizationCompanyCertificate,
  GetOrganizationSettings,
  InviteOrganizationMember,
  InviteOrganizationMemberIn,
  ListOrganizationCompanies,
  ListOrganizationCompanyCertificates,
  ListOrganizationRoles,
  ListMyOrganizations,
  ListOrganizations,
  Organization,
  OrganizationCompany,
  OrganizationCompanyCertificate,
  OrganizationMember,
  OrganizationRole,
  OrganizationSettings,
  RemoveOrganizationCompany,
  RemoveOrganizationCompanyCertificate,
  RemoveOrganizationCompanyCertificateIn,
  RemoveOrganizationCompanyIn,
  RemoveOrganizationMember,
  RemoveOrganizationMemberIn,
  RemoveOrganization,
  RemoveOrganizationIn,
  UpdateOrganizationCompany,
  UpdateOrganizationCompanyCertificate,
  UpdateOrganizationCompanyCertificateIn,
  UpdateOrganizationCompanyIn,
  UploadOrganizationCompanyCertificate,
  UpdateOrganizationSettings,
  UpdateOrganizationSettingsIn,
  UpdateOrganizationIntegrationSettings,
  UpdateOrganizationIntegrationSettingsIn,
  UpdateOrganizationRolePermissions,
  UpdateOrganizationRolePermissionsIn,
} from '@nexus/organization';
import { PageResult } from '@nexus/shared';
import { PrismaAuthTokenRepository } from '../auth/auth-token.prisma';
import { BcryptCryptoProvider } from '../auth/bcrypt.crypto';
import { PrismaUserRepository } from '../auth/user.prisma';
import { TransactionalEmailService } from '../email/transactional-email.service';
import { PrismaOrganizationMemberRepository } from './organization-member.prisma';
import { PrismaOrganizationCompanyCertificateRepository } from './organization-company-certificate.prisma';
import { PrismaOrganizationCompanyRepository } from './organization-company.prisma';
import { PrismaOrganizationSettingsRepository } from './organization-settings.prisma';
import { PrismaOrganizationRepository } from './organization.prisma';
import { PrismaOrganizationRolePermissionRepository } from './organization-role-permission.prisma';
import { PrismaOrganizationRoleRepository } from './organization-role.prisma';
import { AzureKeyVaultCertificateProvider } from './azure-key-vault.certificate-vault';
import {
  buildSapIntegrationSecretName,
  SAP_INTEGRATION_LOCAL_SECRET_MARKER,
} from './sap-integration-secret.util';
import { CertificateUploadInput } from './certificate-upload.helper';

function serializeOrganization(organization: Organization) {
  return {
    id: organization.id,
    nome: organization.nome,
    slug: organization.slug,
  };
}

function serializeRole(role: OrganizationRole) {
  return {
    id: role.id,
    organizationId: role.organizationId,
    nome: role.nome,
    slug: role.slug,
  };
}

function serializeMember(member: OrganizationMember) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    roleId: member.roleId,
  };
}

function serializeCompany(company: OrganizationCompany) {
  return {
    id: company.id,
    organizationId: company.organizationId,
    cnpj: company.cnpj,
    razaoSocial: company.razaoSocial,
    status: company.status,
  };
}

function serializeCertificate(certificate: OrganizationCompanyCertificate) {
  return {
    id: certificate.id,
    organizationId: certificate.organizationId,
    companyId: certificate.companyId,
    name: certificate.name,
    description: certificate.description,
    status: certificate.status,
    keyVaultCertName: certificate.keyVaultCertName,
    thumbprint: certificate.thumbprint,
    subject: certificate.subject,
    issuer: certificate.issuer,
    expiresAt: certificate.expiresAt,
    createdAt: certificate.createdAt,
    updatedAt: certificate.updatedAt,
  };
}

function serializeSettings(settings: OrganizationSettings) {
  return {
    id: settings.id,
    organizationId: settings.organizationId,
    maxCompanies: settings.maxCompanies,
    integration: {
      baseUrl: settings.integrationBaseUrl ?? null,
      clientId: settings.integrationClientId ?? null,
      secretConfigured: Boolean(
        settings.integrationSecretKeyVaultName ||
          settings.integrationClientSecretLocal,
      ),
      sapClient: settings.sapClient ?? null,
      sapLanguage: settings.sapLanguage ?? null,
    },
  };
}

@Injectable()
export class OrganizationFacadeService {
  private readonly appUrl: string;

  constructor(
    private readonly organizationRepository: PrismaOrganizationRepository,
    private readonly organizationRoleRepository: PrismaOrganizationRoleRepository,
    private readonly organizationMemberRepository: PrismaOrganizationMemberRepository,
    private readonly organizationCompanyRepository: PrismaOrganizationCompanyRepository,
    private readonly organizationCompanyCertificateRepository: PrismaOrganizationCompanyCertificateRepository,
    private readonly organizationSettingsRepository: PrismaOrganizationSettingsRepository,
    private readonly organizationRolePermissionRepository: PrismaOrganizationRolePermissionRepository,
    private readonly certificateVaultProvider: AzureKeyVaultCertificateProvider,
    private readonly userRepository: PrismaUserRepository,
    private readonly cryptoProvider: BcryptCryptoProvider,
    private readonly authTokenRepository: PrismaAuthTokenRepository,
    private readonly transactionalEmail: TransactionalEmailService,
    private readonly configService: ConfigService,
  ) {
    this.appUrl = configService.get<string>('APP_URL') ?? 'http://localhost:3000';
  }

  async createOrganization(
    input: Omit<CreateOrganizationIn, 'actorRole'>,
    actor: JwtPayload,
  ) {
    const organization = await new CreateOrganization(
      this.organizationRepository,
      this.organizationSettingsRepository,
      this.organizationRoleRepository,
      this.organizationRolePermissionRepository,
    ).execute({
      ...input,
      actorRole: actor.role,
    });

    return serializeOrganization(organization);
  }

  async listOrganizations(actor: JwtPayload, page = 1, perPage = 20) {
    const result = await new ListOrganizations(
      this.organizationRepository,
    ).execute({
      page,
      perPage,
      actorRole: actor.role,
    });

    return this.serializeOrganizationPage(result);
  }

  async listMyOrganizations(actor: JwtPayload) {
    return new ListMyOrganizations(
      this.organizationRepository,
      this.organizationMemberRepository,
      this.organizationRoleRepository,
    ).execute({
      userId: actor.sub,
      actorRole: actor.role,
    });
  }

  async inviteMember(
    input: Omit<InviteOrganizationMemberIn, 'actorRole' | 'invitedBy'>,
    actor: JwtPayload,
  ) {
    const result = await new InviteOrganizationMember(
      this.userRepository,
      this.authTokenRepository,
      this.transactionalEmail,
      this.organizationRoleRepository,
      this.organizationMemberRepository,
      this.appUrl,
    ).execute({
      ...input,
      invitedBy: actor.email,
      actorRole: actor.role,
    });

    if (result.action === 'linked') {
      return {
        action: 'linked' as const,
        member: serializeMember(result.member),
      };
    }

    return { action: 'invited' as const };
  }

  async createOrganizationUser(
    input: CreateOrganizationUserIn,
    _actor: JwtPayload,
  ) {
    const result = await new CreateOrganizationUser(
      this.cryptoProvider,
      this.userRepository,
      this.organizationRoleRepository,
      this.organizationMemberRepository,
    ).execute(input);

    return {
      user: {
        id: result.user.id,
        nome: result.user.nome,
        sobrenome: result.user.sobrenome,
        email: result.user.email,
        role: result.user.role,
      },
      member: serializeMember(result.member),
    };
  }

  async getOrganization(organizationId: string) {
    const organization = await new GetOrganization(
      this.organizationRepository,
    ).execute({
      organizationId,
    });

    return serializeOrganization(organization);
  }

  async listRoles(organizationId: string, page = 1, perPage = 20) {
    const result = await new ListOrganizationRoles(
      this.organizationRoleRepository,
    ).execute({
      organizationId,
      page,
      perPage,
    });

    const items = await Promise.all(
      result.items.map(async (role) => {
        const permissions =
          await this.organizationRolePermissionRepository.findByRoleId(role.id);

        return {
          ...serializeRole(role),
          permissions: permissions.map((permission) => permission.permission),
        };
      }),
    );

    return {
      ...result,
      items,
    };
  }

  async createRole(input: CreateOrganizationRoleIn) {
    const role = await new CreateOrganizationRole(
      this.organizationRoleRepository,
    ).execute(input);

    return serializeRole(role);
  }

  updateRolePermissions(input: UpdateOrganizationRolePermissionsIn) {
    return new UpdateOrganizationRolePermissions(
      this.organizationRoleRepository,
      this.organizationRolePermissionRepository,
    ).execute(input);
  }

  async listMembers(organizationId: string, page = 1, perPage = 20) {
    const result = await this.organizationMemberRepository.findPageWithRelations({
      organizationId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(({ member, user, role }) => ({
        id: member.id,
        organizationId: member.organizationId,
        userId: member.userId,
        roleId: member.roleId,
        user: {
          nome: user.nome,
          sobrenome: user.sobrenome,
          email: user.email,
        },
        role: {
          id: role.id,
          nome: role.nome,
          slug: role.slug,
        },
      })),
    };
  }

  async addMember(input: AddOrganizationMemberIn) {
    const member = await new AddOrganizationMember(
      this.organizationMemberRepository,
      this.organizationRoleRepository,
      this.userRepository,
    ).execute(input);

    return serializeMember(member);
  }

  removeMember(input: RemoveOrganizationMemberIn) {
    return new RemoveOrganizationMember(
      this.organizationMemberRepository,
    ).execute(input);
  }

  removeOrganization(input: RemoveOrganizationIn) {
    return new RemoveOrganization(this.organizationRepository).execute(input);
  }

  async listCompanies(organizationId: string, page = 1, perPage = 20) {
    const result = await new ListOrganizationCompanies(
      this.organizationCompanyRepository,
    ).execute({
      organizationId,
      page,
      perPage,
    });

    return this.serializeCompanyPage(result);
  }

  async createCompany(input: CreateOrganizationCompanyIn) {
    const company = await new CreateOrganizationCompany(
      this.organizationCompanyRepository,
      this.organizationRepository,
      this.organizationSettingsRepository,
    ).execute(input);

    return serializeCompany(company);
  }

  async getCompany(organizationId: string, companyId: string) {
    const company = await new GetOrganizationCompany(
      this.organizationCompanyRepository,
    ).execute({
      organizationId,
      companyId,
    });

    return serializeCompany(company);
  }

  async updateCompany(input: UpdateOrganizationCompanyIn) {
    const company = await new UpdateOrganizationCompany(
      this.organizationCompanyRepository,
    ).execute(input);

    return serializeCompany(company);
  }

  removeCompany(input: RemoveOrganizationCompanyIn) {
    return new RemoveOrganizationCompany(
      this.organizationCompanyRepository,
    ).execute(input);
  }

  async listCompanyCertificates(
    organizationId: string,
    companyId: string,
    page = 1,
    perPage = 50,
  ) {
    const result = await new ListOrganizationCompanyCertificates(
      this.organizationCompanyRepository,
      this.organizationCompanyCertificateRepository,
    ).execute({
      organizationId,
      companyId,
      page,
      perPage,
    });

    return this.serializeCertificatePage(result);
  }

  async getCompanyCertificate(
    organizationId: string,
    companyId: string,
    certificateId: string,
  ) {
    const certificate = await new GetOrganizationCompanyCertificate(
      this.organizationCompanyCertificateRepository,
    ).execute({
      organizationId,
      companyId,
      certificateId,
    });

    return serializeCertificate(certificate);
  }

  async uploadCompanyCertificate(
    organizationId: string,
    companyId: string,
    input: CertificateUploadInput,
  ) {
    const certificate = await new UploadOrganizationCompanyCertificate(
      this.organizationCompanyRepository,
      this.organizationCompanyCertificateRepository,
      this.certificateVaultProvider,
    ).execute({
      organizationId,
      companyId,
      buffer: input.buffer,
      password: input.password,
      name: input.name,
      description: input.description,
      status: input.status,
    });

    return serializeCertificate(certificate);
  }

  async updateCompanyCertificate(
    input: UpdateOrganizationCompanyCertificateIn,
  ) {
    const certificate = await new UpdateOrganizationCompanyCertificate(
      this.organizationCompanyCertificateRepository,
    ).execute(input);

    return serializeCertificate(certificate);
  }

  removeCompanyCertificate(input: RemoveOrganizationCompanyCertificateIn) {
    return new RemoveOrganizationCompanyCertificate(
      this.organizationCompanyCertificateRepository,
      this.certificateVaultProvider,
    ).execute(input);
  }

  async getSettings(organizationId: string) {
    const settings = await new GetOrganizationSettings(
      this.organizationSettingsRepository,
      this.organizationRepository,
    ).execute({ organizationId });

    return serializeSettings(settings);
  }

  async getIntegrationSettings(organizationId: string) {
    const settings = await new GetOrganizationSettings(
      this.organizationSettingsRepository,
      this.organizationRepository,
    ).execute({ organizationId });

    return serializeSettings(settings).integration;
  }

  async updateSettings(
    input: Omit<UpdateOrganizationSettingsIn, 'actorRole'>,
    actor: JwtPayload,
  ) {
    const settings = await new UpdateOrganizationSettings(
      this.organizationSettingsRepository,
      this.organizationRepository,
    ).execute({
      ...input,
      actorRole: actor.role,
    });

    return serializeSettings(settings);
  }

  async updateIntegrationSettings(
    input: Omit<UpdateOrganizationIntegrationSettingsIn, 'actorRole'> & {
      clientSecret?: string;
    },
    _actor: JwtPayload,
  ) {
    let secretKeyVaultName = input.integrationSecretKeyVaultName ?? undefined;
    let secretKeyVaultId: string | null | undefined =
      input.integrationSecretKeyVaultId ?? undefined;
    let integrationClientSecretLocal: string | null | undefined;

    if (input.clientSecret?.trim()) {
      const useLocalSecrets =
        this.configService.get<string>('SAP_INTEGRATION_LOCAL_SECRETS') ===
        'true';

      if (useLocalSecrets) {
        secretKeyVaultName = SAP_INTEGRATION_LOCAL_SECRET_MARKER;
        secretKeyVaultId = null;
        integrationClientSecretLocal = input.clientSecret.trim();
      } else {
        const secretName = buildSapIntegrationSecretName(input.organizationId);
        const stored = await this.certificateVaultProvider.storeNamedSecret(
          secretName,
          input.clientSecret.trim(),
        );
        secretKeyVaultName = stored.secretName;
        secretKeyVaultId = stored.secretId;
        integrationClientSecretLocal = null;
      }
    }

    const settings = await new UpdateOrganizationIntegrationSettings(
      this.organizationSettingsRepository,
      this.organizationRepository,
    ).execute({
      organizationId: input.organizationId,
      integrationBaseUrl: input.integrationBaseUrl,
      integrationClientId: input.integrationClientId,
      integrationSecretKeyVaultName: secretKeyVaultName ?? null,
      integrationSecretKeyVaultId: secretKeyVaultId ?? null,
      integrationClientSecretLocal: integrationClientSecretLocal ?? undefined,
      sapClient: input.sapClient,
      sapLanguage: input.sapLanguage,
    });

    return serializeSettings(settings);
  }

  private serializeOrganizationPage(result: PageResult<Organization>) {
    return {
      ...result,
      items: result.items.map(serializeOrganization),
    };
  }

  private serializeRolePage(result: PageResult<OrganizationRole>) {
    return {
      ...result,
      items: result.items.map(serializeRole),
    };
  }

  private serializeMemberPage(result: PageResult<OrganizationMember>) {
    return {
      ...result,
      items: result.items.map(serializeMember),
    };
  }

  private serializeCompanyPage(result: PageResult<OrganizationCompany>) {
    return {
      ...result,
      items: result.items.map(serializeCompany),
    };
  }

  private serializeCertificatePage(
    result: PageResult<OrganizationCompanyCertificate>,
  ) {
    return {
      ...result,
      items: result.items.map(serializeCertificate),
    };
  }
}
