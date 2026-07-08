import { Module, forwardRef } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { EmailModule } from '../email/email.module';
import { OrganizationModule } from '../organization/organization.module';
import { AuthController } from './auth.controller';
import { AuthSessionController } from './auth-session.controller';
import { NotificationController } from './notification.controller';
import { AuthFacadeService } from './auth-facade.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import { PrismaAuthTokenRepository } from './auth-token.prisma';
import { BcryptCryptoProvider } from './bcrypt.crypto';
import { JwtTokenProvider } from './jwt.token';
import { PrismaUserRepository } from './user.prisma';
import { PrismaUserNotificationRepository } from './user-notification.prisma';

@Module({
  imports: [DbModule, EmailModule, forwardRef(() => OrganizationModule)],
  controllers: [AuthController, AuthSessionController, NotificationController],
  providers: [
    PrismaUserRepository,
    PrismaUserNotificationRepository,
    PrismaAuthTokenRepository,
    BcryptCryptoProvider,
    JwtTokenProvider,
    MicrosoftOAuthService,
    AuthFacadeService,
  ],
  exports: [
    PrismaUserRepository,
    PrismaAuthTokenRepository,
    BcryptCryptoProvider,
    JwtTokenProvider,
  ],
})
export class AuthModule {}
