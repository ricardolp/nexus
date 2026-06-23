import { IntegrationContext } from '@nexus/integration';
import { Request } from 'express';

export interface IntegrationRequest extends Request {
  integrationContext: IntegrationContext;
}
