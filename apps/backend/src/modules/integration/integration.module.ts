import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DbModule } from '../../db/db.module';
import { IntegrationAuthGuard } from '../../shared/auth/integration-auth.guard';
import { FiscalModule } from '../fiscal/fiscal.module';
import { EventDispatchModule } from './event-dispatch.module';
import { IntegrationFacadeService } from './integration-facade.service';
import { IntegrationFiscalController } from './integration-fiscal.controller';
import { IntegrationManagementController } from './integration-management.controller';
import { PrismaIntegrationTokenRepository } from './integration-token.prisma';
import { PrismaWebhookDeliveryRepository } from './webhook-delivery.prisma';
import { PrismaWebhookEndpointRepository } from './webhook-endpoint.prisma';

@Module({
  imports: [DbModule, FiscalModule, EventDispatchModule],
  controllers: [IntegrationManagementController, IntegrationFiscalController],
  providers: [
    PrismaIntegrationTokenRepository,
    PrismaWebhookEndpointRepository,
    PrismaWebhookDeliveryRepository,
    IntegrationFacadeService,
    IntegrationAuthGuard,
    {
      provide: APP_GUARD,
      useClass: IntegrationAuthGuard,
    },
  ],
  exports: [PrismaIntegrationTokenRepository],
})
export class IntegrationModule {}
