import { Controller, Get } from '@nestjs/common';
import type { JwtPayload } from '@nexus/auth';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthFacadeService } from './auth-facade.service';

@Controller('auth')
export class AuthSessionController {
  constructor(private readonly authFacade: AuthFacadeService) {}

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authFacade.getCurrentUser(user.sub);
  }
}
