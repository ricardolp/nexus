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
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { OrganizationAccessGuard } from '../../shared/auth/organization-access.guard';
import { FiscalFacadeService } from './fiscal-facade.service';

@Controller('organization')
export class FiscalNumberRangeController {
  constructor(private readonly fiscalFacade: FiscalFacadeService) {}

  @Get(':organizationId/companies/:companyId/number-ranges/nfe')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:read')
  listNfeNumberRanges(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeNumberRanges(
      organizationId,
      companyId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/companies/:companyId/number-ranges/nfe')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:create')
  createNfeNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeNumberRangeRecord(
      organizationId,
      companyId,
      body,
    );
  }

  @Get(':organizationId/companies/:companyId/number-ranges/nfe/:rangeId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:read')
  getNfeNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
  ) {
    return this.fiscalFacade.getNfeNumberRange(
      organizationId,
      companyId,
      rangeId,
    );
  }

  @Patch(':organizationId/companies/:companyId/number-ranges/nfe/:rangeId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:update')
  updateNfeNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeNumberRangeRecord(
      organizationId,
      companyId,
      rangeId,
      body,
    );
  }

  @Delete(':organizationId/companies/:companyId/number-ranges/nfe/:rangeId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:delete')
  removeNfeNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
  ) {
    return this.fiscalFacade.removeNfeNumberRange(
      organizationId,
      companyId,
      rangeId,
    );
  }

  @Get(':organizationId/companies/:companyId/number-ranges/nfe/:rangeId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:events:read')
  listNfeNumberRangeEvents(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeNumberRangeEvents(
      organizationId,
      companyId,
      rangeId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/companies/:companyId/number-ranges/nfe/:rangeId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:events:create')
  createNfeNumberRangeEvent(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeNumberRangeEventRecord(
      organizationId,
      companyId,
      rangeId,
      body,
    );
  }

  @Get(
    ':organizationId/companies/:companyId/number-ranges/nfe/:rangeId/events/:eventId',
  )
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfe:events:read')
  getNfeNumberRangeEvent(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfeNumberRangeEvent(
      organizationId,
      companyId,
      rangeId,
      eventId,
    );
  }

  @Get(':organizationId/companies/:companyId/number-ranges/nfse')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:read')
  listNfseNumberRanges(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseNumberRanges(
      organizationId,
      companyId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/companies/:companyId/number-ranges/nfse')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:create')
  createNfseNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseNumberRangeRecord(
      organizationId,
      companyId,
      body,
    );
  }

  @Get(':organizationId/companies/:companyId/number-ranges/nfse/:rangeId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:read')
  getNfseNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
  ) {
    return this.fiscalFacade.getNfseNumberRange(
      organizationId,
      companyId,
      rangeId,
    );
  }

  @Patch(':organizationId/companies/:companyId/number-ranges/nfse/:rangeId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:update')
  updateNfseNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseNumberRangeRecord(
      organizationId,
      companyId,
      rangeId,
      body,
    );
  }

  @Delete(':organizationId/companies/:companyId/number-ranges/nfse/:rangeId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:delete')
  removeNfseNumberRange(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
  ) {
    return this.fiscalFacade.removeNfseNumberRange(
      organizationId,
      companyId,
      rangeId,
    );
  }

  @Get(':organizationId/companies/:companyId/number-ranges/nfse/:rangeId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:events:read')
  listNfseNumberRangeEvents(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseNumberRangeEvents(
      organizationId,
      companyId,
      rangeId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/companies/:companyId/number-ranges/nfse/:rangeId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:events:create')
  createNfseNumberRangeEvent(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseNumberRangeEventRecord(
      organizationId,
      companyId,
      rangeId,
      body,
    );
  }

  @Get(
    ':organizationId/companies/:companyId/number-ranges/nfse/:rangeId/events/:eventId',
  )
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:companies:number-ranges:nfse:events:read')
  getNfseNumberRangeEvent(
    @Param('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfseNumberRangeEvent(
      organizationId,
      companyId,
      rangeId,
      eventId,
    );
  }
}
