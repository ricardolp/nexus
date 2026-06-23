import { applyDecorators, SetMetadata } from '@nestjs/common';
import { IntegrationApiScope } from '@nexus/shared';
import {
  INTEGRATION_SCOPES_KEY,
  IS_INTEGRATION_ROUTE_KEY,
} from '../auth/auth.constants';

export const IntegrationRoute = (...scopes: IntegrationApiScope[]) =>
  applyDecorators(
    SetMetadata(IS_INTEGRATION_ROUTE_KEY, true),
    SetMetadata(INTEGRATION_SCOPES_KEY, scopes),
  );
