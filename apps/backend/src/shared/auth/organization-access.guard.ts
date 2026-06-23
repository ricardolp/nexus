import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OrganizationAuthorizationService } from '../../modules/organization/organization-authorization.service';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    private readonly organizationAuthorizationService: OrganizationAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.params.organizationId as string | undefined;

    if (!organizationId) {
      throw new ForbiddenException('Organização não informada');
    }

    const canAccess =
      await this.organizationAuthorizationService.canAccessOrganization(
        request.user.sub,
        request.user.role,
        organizationId,
      );

    if (!canAccess) {
      throw new ForbiddenException('Acesso negado à organização');
    }

    return true;
  }
}
