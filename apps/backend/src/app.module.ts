import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { SharedAuthModule } from './shared/shared-auth.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { IntegrationModule } from './modules/integration/integration.module';

@Module({
  imports: [
    DbModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(__dirname, '..', '.env'),
      ],
    }),
    AuthModule,
    EmailModule,
    OrganizationModule,
    SharedAuthModule,
    FiscalModule,
    IntegrationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}