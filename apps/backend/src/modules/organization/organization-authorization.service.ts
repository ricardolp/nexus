import { Injectable } from '@nestjs/common';
import { Permission } from '@nexus/shared';
import { PrismaOrganizationMemberRepository } from './organization-member.prisma';
import { PrismaOrganizationRolePermissionRepository } from './organization-role-permission.prisma';

@Injectable()
export class OrganizationAuthorizationService {
  constructor(
    private readonly organizationMemberRepository: PrismaOrganizationMemberRepository,
    private readonly organizationRolePermissionRepository: PrismaOrganizationRolePermissionRepository,
  ) {}

  isGlobalAdmin(userRole: string): boolean {
    return userRole === 'admin';
  }

  async canAccessOrganization(
    userId: string,
    userRole: string,
    organizationId: string,
  ): Promise<boolean> {
    if (this.isGlobalAdmin(userRole)) {
      return true;
    }

    const member =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        userId,
      );

    return member !== null;
  }

  async hasPermission(
    userId: string,
    userRole: string,
    organizationId: string,
    permission: Permission,
  ): Promise<boolean> {
    if (this.isGlobalAdmin(userRole)) {
      return true;
    }

    const member =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        userId,
      );

    if (!member) {
      return false;
    }

    const permissions =
      await this.organizationRolePermissionRepository.findByRoleId(
        member.roleId,
      );

    return permissions.some((item) => item.permission === permission);
  }
}
