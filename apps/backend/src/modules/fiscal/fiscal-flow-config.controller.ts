import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { OrganizationAccessGuard } from '../../shared/auth/organization-access.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { JwtPayload } from '@nexus/auth';
import { FiscalFlowFacadeService } from './fiscal-flow-facade.service';

@Controller('organization')
export class FiscalFlowConfigController {
  constructor(private readonly flowFacade: FiscalFlowFacadeService) {}

  @Get(':organizationId/companies/:companyId/documents/nfe/flow-config')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:read')
  listFlowConfigs(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Query('model') model?: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.flowFacade.listFlowConfigs(
      organizationId,
      companyId,
      model,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/companies/:companyId/documents/nfe/flow-config')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:create')
  createFlowConfig(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.flowFacade.createFlowConfigDraft(
      organizationId,
      companyId,
      body,
      user.sub,
    );
  }

  @Get(':organizationId/companies/:companyId/documents/nfe/flow-config/:configId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:read')
  getFlowConfig(@Param('configId') configId: string) {
    return this.flowFacade.getFlowConfig(configId);
  }

  @Put(':organizationId/companies/:companyId/documents/nfe/flow-config/:configId/draft')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:update')
  saveFlowConfigDraft(
    @Param('configId') configId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.flowFacade.saveFlowConfigDraft(configId, body, user.sub);
  }

  @Post(':organizationId/companies/:companyId/documents/nfe/flow-config/:configId/publish')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:publish')
  publishFlowConfig(
    @Param('configId') configId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.flowFacade.publishFlowConfig(configId, body, user.sub);
  }

  @Post(':organizationId/companies/:companyId/documents/nfe/flow-config/:configId/duplicate')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:create')
  duplicateFlowConfig(
    @Param('configId') configId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.flowFacade.duplicateFlowConfig(configId, user.sub);
  }

  @Post(':organizationId/companies/:companyId/documents/nfe/flow-config/:configId/test')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:test')
  testFlowConfig(
    @Param('configId') configId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.flowFacade.testFlowConfig(configId, body);
  }

  @Get(':organizationId/companies/:companyId/documents/nfe/flow-config/:configId/history')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:read')
  getFlowConfigHistory(
    @Param('configId') configId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.flowFacade.getFlowConfigHistory(
      configId,
      Number(page),
      Number(perPage),
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/flow-instance')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:documents:nfe:flow-config:read')
  getFlowInstanceByDocument(@Param('documentId') documentId: string) {
    return this.flowFacade.getFlowInstanceByDocument(documentId);
  }
}
