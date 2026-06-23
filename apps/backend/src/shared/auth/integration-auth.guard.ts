import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hashToken } from '@nexus/shared';
import { PrismaIntegrationTokenRepository } from '../../modules/integration/integration-token.prisma';
import {
  INTEGRATION_SCOPES_KEY,
  IS_INTEGRATION_ROUTE_KEY,
} from './auth.constants';
import { IntegrationRequest } from '../types/integration-request.type';

@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly integrationTokenRepository: PrismaIntegrationTokenRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isIntegrationRoute = this.reflector.getAllAndOverride<boolean>(
      IS_INTEGRATION_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isIntegrationRoute) {
      return true;
    }

    const requiredScopes =
      this.reflector.getAllAndOverride<string[]>(INTEGRATION_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de integração não informado');
    }

    const secret = authorization.slice('Bearer '.length);
    const token = await this.integrationTokenRepository.findByTokenHash(
      hashToken(secret),
    );

    if (!token || token.isRevoked() || token.isExpired()) {
      throw new UnauthorizedException('Token de integração inválido');
    }

    for (const scope of requiredScopes) {
      if (!token.hasScope(scope)) {
        throw new ForbiddenException(`Escopo ausente: ${scope}`);
      }
    }

    request.integrationContext = {
      tokenId: token.id,
      organizationId: token.organizationId,
      scopes: token.scopes,
    };

    void this.integrationTokenRepository.touch(token.id);

    return true;
  }
}
