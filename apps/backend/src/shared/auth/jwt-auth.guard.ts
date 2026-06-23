import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtTokenProvider } from '../../modules/auth/jwt.token';
import { IS_PUBLIC_KEY, IS_INTEGRATION_ROUTE_KEY } from './auth.constants';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenProvider: JwtTokenProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isIntegrationRoute = this.reflector.getAllAndOverride<boolean>(
      IS_INTEGRATION_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isIntegrationRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token não informado');
    }

    const token = authorization.slice('Bearer '.length);

    try {
      request.user = await this.jwtTokenProvider.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
