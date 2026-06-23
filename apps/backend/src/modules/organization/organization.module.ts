import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../../db/db.module';
import { EmailModule } from '../email/email.module';
import { AzureKeyVaultCertificateProvider } from './azure-key-vault.certificate-vault';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationController } from './organization.controller';
import { OrganizationFacadeService } from './organization-facade.service';
import { OrganizationUsageService } from './organization-usage.service';
import { PrismaOrganizationCompanyCertificateRepository } from './organization-company-certificate.prisma';
import { PrismaOrganizationMemberRepository } from './organization-member.prisma';
import { PrismaOrganizationCompanyRepository } from './organization-company.prisma';
import { PrismaOrganizationSettingsRepository } from './organization-settings.prisma';
import { PrismaOrganizationRepository } from './organization.prisma';
import { PrismaOrganizationRolePermissionRepository } from './organization-role-permission.prisma';
import { PrismaOrganizationRoleRepository } from './organization-role.prisma';

@Module({
  imports: [DbModule, forwardRef(() => AuthModule), EmailModule, ConfigModule],
  controllers: [OrganizationController],
  providers: [
    PrismaOrganizationRepository,
    PrismaOrganizationRoleRepository,
    PrismaOrganizationMemberRepository,
    PrismaOrganizationCompanyRepository,
    PrismaOrganizationCompanyCertificateRepository,
    PrismaOrganizationSettingsRepository,
    PrismaOrganizationRolePermissionRepository,
    AzureKeyVaultCertificateProvider,
    OrganizationAuthorizationService,
    OrganizationFacadeService,
    OrganizationUsageService,
  ],
  exports: [OrganizationAuthorizationService, OrganizationFacadeService],
})
export class OrganizationModule {}
