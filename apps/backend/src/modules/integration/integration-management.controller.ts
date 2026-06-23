import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IntegrationApiScope } from '@nexus/shared';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { OrganizationAccessGuard } from '../../shared/auth/organization-access.guard';
import { IntegrationFacadeService } from './integration-facade.service';

class CreateIntegrationTokenDto {
  name!: string;
  scopes!: IntegrationApiScope[];
  expiresAt?: string | null;
}

class CreateWebhookEndpointDto {
  url!: string;
  description?: string | null;
  eventTypes!: string[];
}

class UpdateWebhookEndpointDto {
  url?: string;
  description?: string | null;
  eventTypes?: string[];
  active?: boolean;
}

@Controller('organization')
export class IntegrationManagementController {
  constructor(private readonly integrationFacade: IntegrationFacadeService) {}

  @Get(':organizationId/integration/event-types')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:webhooks:manage')
  listEventTypes() {
    return { items: this.integrationFacade.listEventTypes() };
  }

  @Post(':organizationId/integration/tokens')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:tokens:manage')
  createToken(
    @Param('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: CreateIntegrationTokenDto,
  ) {
    return this.integrationFacade.createToken(
      organizationId,
      userId,
      body.name,
      body.scopes,
      body.expiresAt,
    );
  }

  @Get(':organizationId/integration/tokens')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:tokens:manage')
  listTokens(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.integrationFacade.listTokens(
      organizationId,
      Number(page),
      Number(perPage),
    );
  }

  @Delete(':organizationId/integration/tokens/:tokenId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:tokens:manage')
  revokeToken(
    @Param('organizationId') organizationId: string,
    @Param('tokenId') tokenId: string,
  ) {
    return this.integrationFacade.revokeToken(organizationId, tokenId);
  }

  @Post(':organizationId/integration/webhooks')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:webhooks:manage')
  createWebhook(
    @Param('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: CreateWebhookEndpointDto,
  ) {
    return this.integrationFacade.createWebhook(
      organizationId,
      userId,
      body.url,
      body.eventTypes,
      body.description,
    );
  }

  @Get(':organizationId/integration/webhooks')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:webhooks:manage')
  listWebhooks(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.integrationFacade.listWebhooks(
      organizationId,
      Number(page),
      Number(perPage),
    );
  }

  @Patch(':organizationId/integration/webhooks/:endpointId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:webhooks:manage')
  updateWebhook(
    @Param('organizationId') organizationId: string,
    @Param('endpointId') endpointId: string,
    @Body() body: UpdateWebhookEndpointDto,
  ) {
    return this.integrationFacade.updateWebhook(
      organizationId,
      endpointId,
      body,
    );
  }

  @Delete(':organizationId/integration/webhooks/:endpointId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:webhooks:manage')
  deleteWebhook(
    @Param('organizationId') organizationId: string,
    @Param('endpointId') endpointId: string,
  ) {
    return this.integrationFacade.deleteWebhook(organizationId, endpointId);
  }

  @Get(':organizationId/integration/webhooks/:endpointId/deliveries')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('integration:webhooks:manage')
  listDeliveries(
    @Param('organizationId') organizationId: string,
    @Param('endpointId') endpointId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.integrationFacade.listWebhookDeliveries(
      organizationId,
      endpointId,
      Number(page),
      Number(perPage),
    );
  }
}
