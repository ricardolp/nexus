import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@nexus/shared';
import { OrganizationAuthorizationService } from '../../modules/organization/organization-authorization.service';
import { REQUIRED_PERMISSION_KEY } from './auth.constants';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly organizationAuthorizationService: OrganizationAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.params.organizationId as string | undefined;

    if (!organizationId) {
      return true;
    }

    const permission = this.reflector.getAllAndOverride<Permission>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!permission) {
      return true;
    }

    const allowed = await this.organizationAuthorizationService.hasPermission(
      request.user.sub,
      request.user.role,
      organizationId,
      permission,
    );

    if (!allowed) {
      throw new ForbiddenException('Permissão insuficiente');
    }

    return true;
  }
}
