import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { JwtPayload } from '@nexus/auth';
import { ORGANIZATION_PERMISSIONS, Permission } from '@nexus/shared';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { GlobalAdminGuard } from '../../shared/auth/global-admin.guard';
import { OrganizationAccessGuard } from '../../shared/auth/organization-access.guard';
import { parseCertificateUploadFields } from './certificate-upload.helper';
import { OrganizationFacadeService } from './organization-facade.service';
import { PrismaOrganizationMemberRepository } from './organization-member.prisma';
import { PrismaOrganizationRolePermissionRepository } from './organization-role-permission.prisma';

class CreateOrganizationDto {
  nome!: string;
  slug!: string;
}

class CreateOrganizationRoleDto {
  nome!: string;
  slug!: string;
}

class UpdateRolePermissionsDto {
  permissions!: Permission[];
}

class AddOrganizationMemberDto {
  userId!: string;
  roleId!: string;
}

class InviteOrganizationMemberDto {
  email!: string;
}

class CreateOrganizationUserDto {
  nome!: string;
  sobrenome!: string;
  email!: string;
  senha!: string;
  roleId?: string;
}

class CreateOrganizationCompanyDto {
  cnpj!: string;
  razaoSocial!: string;
}

class UpdateOrganizationCompanyDto {
  razaoSocial?: string;
  status?: 'active' | 'inactive';
}

class UpdateOrganizationSettingsDto {
  maxCompanies!: number;
}

class UpdateOrganizationIntegrationSettingsDto {
  integrationBaseUrl?: string | null;
  integrationClientId?: string | null;
  clientSecret?: string;
  sapClient?: string | null;
  sapLanguage?: string | null;
}

class UpdateOrganizationCompanyCertificateDto {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'expired' | 'revoked';
}

class UploadOrganizationCompanyCertificateDto {
  password?: string;
  name?: string;
  description?: string;
  status?: string;
}

@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly organizationFacade: OrganizationFacadeService,
    private readonly organizationMemberRepository: PrismaOrganizationMemberRepository,
    private readonly organizationRolePermissionRepository: PrismaOrganizationRolePermissionRepository,
  ) {}

  @Post()
  @UseGuards(GlobalAdminGuard)
  createOrganization(
    @Body() body: CreateOrganizationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationFacade.createOrganization(body, user);
  }

  @Get()
  @UseGuards(GlobalAdminGuard)
  listOrganizations(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.organizationFacade.listOrganizations(
      user,
      Number(page),
      Number(perPage),
    );
  }

  @Get('me')
  listMyOrganizations(@CurrentUser() user: JwtPayload) {
    return this.organizationFacade.listMyOrganizations(user);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:read')
  getOrganization(@Param('organizationId') organizationId: string) {
    return this.organizationFacade.getOrganization(organizationId);
  }

  @Delete(':organizationId')
  @UseGuards(GlobalAdminGuard)
  removeOrganization(@Param('organizationId') organizationId: string) {
    return this.organizationFacade.removeOrganization({ organizationId });
  }

  @Get(':organizationId/roles')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:roles:read')
  listRoles(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.organizationFacade.listRoles(
      organizationId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/roles')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:roles:create')
  createRole(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateOrganizationRoleDto,
  ) {
    return this.organizationFacade.createRole({
      organizationId,
      ...body,
    });
  }

  @Patch(':organizationId/roles/:roleId/permissions')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:roles:update')
  updateRolePermissions(
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Body() body: UpdateRolePermissionsDto,
  ) {
    return this.organizationFacade.updateRolePermissions({
      organizationId,
      roleId,
      permissions: body.permissions,
    });
  }

  @Get(':organizationId/members')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:members:read')
  listMembers(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.organizationFacade.listMembers(
      organizationId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/members/invite')
  @UseGuards(GlobalAdminGuard)
  inviteMember(
    @Param('organizationId') organizationId: string,
    @Body() body: InviteOrganizationMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationFacade.inviteMember(
      {
        organizationId,
        email: body.email,
      },
      user,
    );
  }

  @Post(':organizationId/members/create-user')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('user:create')
  createOrganizationUser(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateOrganizationUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationFacade.createOrganizationUser(
      {
        organizationId,
        nome: body.nome,
        sobrenome: body.sobrenome,
        email: body.email,
        senha: body.senha,
        roleId: body.roleId,
      },
      user,
    );
  }

  @Post(':organizationId/members')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:members:create')
  addMember(
    @Param('organizationId') organizationId: string,
    @Body() body: AddOrganizationMemberDto,
  ) {
    return this.organizationFacade.addMember({
      organizationId,
      userId: body.userId,
      roleId: body.roleId,
    });
  }

  @Delete(':organizationId/members/:memberId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:members:delete')
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationFacade.removeMember({
      organizationId,
      memberId,
    });
  }

  @Get(':organizationId/companies')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:read')
  listCompanies(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.organizationFacade.listCompanies(
      organizationId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/companies')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:create')
  createCompany(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateOrganizationCompanyDto,
  ) {
    return this.organizationFacade.createCompany({
      organizationId,
      cnpj: body.cnpj,
      razaoSocial: body.razaoSocial,
    });
  }

  @Get(':organizationId/companies/:companyId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:read')
  getCompany(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.organizationFacade.getCompany(organizationId, companyId);
  }

  @Patch(':organizationId/companies/:companyId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:update')
  updateCompany(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Body() body: UpdateOrganizationCompanyDto,
  ) {
    return this.organizationFacade.updateCompany({
      organizationId,
      companyId,
      razaoSocial: body.razaoSocial,
      status: body.status,
    });
  }

  @Delete(':organizationId/companies/:companyId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:delete')
  removeCompany(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.organizationFacade.removeCompany({
      organizationId,
      companyId,
    });
  }

  @Get(':organizationId/companies/:companyId/certificates')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:certificates:read')
  listCompanyCertificates(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '50',
  ) {
    return this.organizationFacade.listCompanyCertificates(
      organizationId,
      companyId,
      Number(page),
      Number(perPage),
    );
  }

  @Get(':organizationId/companies/:companyId/certificates/:certificateId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:certificates:read')
  getCompanyCertificate(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('certificateId') certificateId: string,
  ) {
    return this.organizationFacade.getCompanyCertificate(
      organizationId,
      companyId,
      certificateId,
    );
  }

  @Post(':organizationId/companies/:companyId/certificates/upload')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:certificates:create')
  @UseInterceptors(
    FileInterceptor('certificate', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadCompanyCertificate(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: UploadOrganizationCompanyCertificateDto,
  ) {
    const fields = parseCertificateUploadFields(body);

    return this.organizationFacade.uploadCompanyCertificate(
      organizationId,
      companyId,
      {
        buffer: file?.buffer ?? Buffer.alloc(0),
        ...fields,
      },
    );
  }

  @Patch(':organizationId/companies/:companyId/certificates/:certificateId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:certificates:update')
  updateCompanyCertificate(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('certificateId') certificateId: string,
    @Body() body: UpdateOrganizationCompanyCertificateDto,
  ) {
    return this.organizationFacade.updateCompanyCertificate({
      organizationId,
      companyId,
      certificateId,
      name: body.name,
      description: body.description,
      status: body.status,
    });
  }

  @Delete(':organizationId/companies/:companyId/certificates/:certificateId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:certificates:delete')
  removeCompanyCertificate(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('certificateId') certificateId: string,
  ) {
    return this.organizationFacade.removeCompanyCertificate({
      organizationId,
      companyId,
      certificateId,
    });
  }

  @Get(':organizationId/settings')
  @UseGuards(GlobalAdminGuard)
  getSettings(@Param('organizationId') organizationId: string) {
    return this.organizationFacade.getSettings(organizationId);
  }

  @Patch(':organizationId/settings')
  @UseGuards(GlobalAdminGuard)
  updateSettings(
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateOrganizationSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationFacade.updateSettings(
      {
        organizationId,
        maxCompanies: body.maxCompanies,
      },
      user,
    );
  }

  @Get(':organizationId/settings/integration')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:integration:read')
  getIntegrationSettings(@Param('organizationId') organizationId: string) {
    return this.organizationFacade.getIntegrationSettings(organizationId);
  }

  @Patch(':organizationId/settings/integration')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:integration:update')
  updateIntegrationSettings(
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateOrganizationIntegrationSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationFacade.updateIntegrationSettings(
      {
        organizationId,
        integrationBaseUrl: body.integrationBaseUrl,
        integrationClientId: body.integrationClientId,
        clientSecret: body.clientSecret,
        sapClient: body.sapClient,
        sapLanguage: body.sapLanguage,
      },
      user,
    );
  }

  @Get(':organizationId/me/permissions')
  @UseGuards(OrganizationAccessGuard)
  async getMyPermissions(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role === 'admin') {
      return { permissions: [...ORGANIZATION_PERMISSIONS] };
    }

    const member =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        user.sub,
      );

    if (!member) {
      return { permissions: [] };
    }

    const permissions =
      await this.organizationRolePermissionRepository.findByRoleId(
        member.roleId,
      );

    return {
      permissions: permissions.map((item) => item.permission),
    };
  }
}
