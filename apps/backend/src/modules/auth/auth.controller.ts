import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators/public.decorator';
import { AuthFacadeService } from './auth-facade.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
class RegisterUserDto {
  nome!: string;
  sobrenome!: string;
  email!: string;
  senha!: string;
}

class LoginUserDto {
  email!: string;
  senha!: string;
}

class ConfirmEmailDto {
  token!: string;
}

class RequestPasswordResetDto {
  email!: string;
}

class ResetPasswordDto {
  token!: string;
  senha!: string;
}

class InviteUserDto {
  email!: string;
  invitedBy!: string;
  role?: 'member' | 'admin';
}

class AcceptInviteDto {
  token!: string;
  nome!: string;
  sobrenome!: string;
  senha!: string;
}

@Controller('auth')
@Public()
export class AuthController {
  constructor(
    private readonly authFacade: AuthFacadeService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('/')
  getAuth() {
    return { message: 'Auth endpoint' };
  }

  @Post('register')
  register(@Body() body: RegisterUserDto) {
    return this.authFacade.register(body);
  }

  @Post('login')
  login(@Body() body: LoginUserDto) {
    return this.authFacade.login(body);
  }

  @Post('confirm-email')
  confirmEmail(@Body() body: ConfirmEmailDto) {
    return this.authFacade.confirmEmail(body);
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    return this.authFacade.requestPasswordReset(body);
  }

  @Post('password-reset/confirm')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authFacade.resetPassword(body);
  }

  @Post('invite')
  inviteUser(@Body() body: InviteUserDto) {
    return this.authFacade.inviteUser(body);
  }

  @Post('invite/accept')
  acceptInvite(@Body() body: AcceptInviteDto) {
    return this.authFacade.acceptInvite(body);
  }

  @Get('microsoft')
  microsoftLogin(@Res() res: Response) {
    return res.redirect(this.microsoftOAuth.getAuthorizationUrl());
  }

  @Get('microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const profile = await this.microsoftOAuth.handleCallback(code, state);
    const result = await this.authFacade.loginMicrosoft(profile);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const redirectUrl = new URL('/api/auth/oauth/callback', frontendUrl);
    redirectUrl.searchParams.set('token', result.accessToken);
    return res.redirect(redirectUrl.toString());
  }
}
