import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AcceptInvite,
  AcceptInviteIn,
  ConfirmEmail,
  ConfirmEmailIn,
  GetCurrentUser,
  InviteUser,
  InviteUserIn,
  LoginMicrosoft,
  LoginUser,
  LoginUserIn,
  LoginUserOut,
  RegisterUser,
  RegisterUserIn,
  RequestPasswordReset,
  RequestPasswordResetIn,
  ResetPassword,
  ResetPasswordIn,
} from '@nexus/auth';
import { OrganizationFacadeService } from '../organization/organization-facade.service';
import { TransactionalEmailService } from '../email/transactional-email.service';
import { BcryptCryptoProvider } from './bcrypt.crypto';
import { JwtTokenProvider } from './jwt.token';
import { PrismaAuthTokenRepository } from './auth-token.prisma';
import { PrismaUserRepository } from './user.prisma';

@Injectable()
export class AuthFacadeService {
  private readonly appUrl: string;
  private readonly appName: string;

  constructor(
    private readonly userRepository: PrismaUserRepository,
    private readonly authTokenRepository: PrismaAuthTokenRepository,
    private readonly cryptoProvider: BcryptCryptoProvider,
    private readonly jwtProvider: JwtTokenProvider,
    private readonly transactionalEmail: TransactionalEmailService,
    @Inject(forwardRef(() => OrganizationFacadeService))
    private readonly organizationFacade: OrganizationFacadeService,
    configService: ConfigService,
  ) {
    this.appUrl = configService.get<string>('APP_URL') ?? 'http://localhost:3000';
    this.appName = 'Nexus';
  }

  register(input: RegisterUserIn): Promise<void> {
    return new RegisterUser(
      this.cryptoProvider,
      this.userRepository,
      this.authTokenRepository,
      this.transactionalEmail,
      this.appUrl,
      this.appName,
    ).execute(input);
  }

  login(input: LoginUserIn): Promise<LoginUserOut> {
    return new LoginUser(
      this.userRepository,
      this.cryptoProvider,
      this.jwtProvider,
    ).execute(input);
  }

  loginMicrosoft(input: {
    email: string;
    nome: string;
    sobrenome: string;
  }): Promise<LoginUserOut> {
    return new LoginMicrosoft(
      this.userRepository,
      this.cryptoProvider,
      this.jwtProvider,
    ).execute(input);
  }

  getCurrentUser(userId: string) {
    return new GetCurrentUser(this.userRepository).execute({ userId });
  }

  confirmEmail(input: ConfirmEmailIn): Promise<void> {
    return new ConfirmEmail(
      this.authTokenRepository,
      this.userRepository,
    ).execute(input);
  }

  requestPasswordReset(input: RequestPasswordResetIn): Promise<void> {
    return new RequestPasswordReset(
      this.userRepository,
      this.authTokenRepository,
      this.transactionalEmail,
      this.appUrl,
    ).execute(input);
  }

  resetPassword(input: ResetPasswordIn): Promise<void> {
    return new ResetPassword(
      this.authTokenRepository,
      this.userRepository,
      this.cryptoProvider,
      this.transactionalEmail,
      this.appUrl,
    ).execute(input);
  }

  inviteUser(input: InviteUserIn): Promise<void> {
    return new InviteUser(
      this.userRepository,
      this.authTokenRepository,
      this.transactionalEmail,
      this.appUrl,
    ).execute(input);
  }

  async acceptInvite(input: AcceptInviteIn): Promise<void> {
    const result = await new AcceptInvite(
      this.authTokenRepository,
      this.userRepository,
      this.cryptoProvider,
      this.transactionalEmail,
      this.appUrl,
      this.appName,
    ).execute(input);

    const organizationId = result.metadados?.organizationId;
    const organizationRoleId = result.metadados?.organizationRoleId;

    if (
      typeof organizationId === 'string' &&
      typeof organizationRoleId === 'string'
    ) {
      await this.organizationFacade.addMember({
        organizationId,
        userId: result.userId,
        roleId: organizationRoleId,
      });
    }
  }
}
