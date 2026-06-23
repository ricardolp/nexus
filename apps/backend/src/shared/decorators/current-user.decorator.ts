import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@nexus/auth';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    context: ExecutionContext,
  ): JwtPayload | JwtPayload[keyof JwtPayload] => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (data) {
      return user[data];
    }

    return user;
  },
);
