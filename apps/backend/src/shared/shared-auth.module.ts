import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../modules/auth/auth.module';
import { OrganizationModule } from '../modules/organization/organization.module';
import { GlobalAdminGuard } from './auth/global-admin.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { OrganizationAccessGuard } from './auth/organization-access.guard';
import { PermissionGuard } from './auth/permission.guard';

@Global()
@Module({
  imports: [AuthModule, OrganizationModule],
  providers: [
    JwtAuthGuard,
    GlobalAdminGuard,
    OrganizationAccessGuard,
    PermissionGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
  exports: [
    OrganizationModule,
    JwtAuthGuard,
    GlobalAdminGuard,
    OrganizationAccessGuard,
    PermissionGuard,
  ],
})
export class SharedAuthModule {}
