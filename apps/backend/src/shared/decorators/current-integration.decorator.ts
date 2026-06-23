import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IntegrationContext } from '@nexus/integration';
import { IntegrationRequest } from '../types/integration-request.type';

export const CurrentIntegration = createParamDecorator(
  (
    data: keyof IntegrationContext | undefined,
    context: ExecutionContext,
  ): IntegrationContext | IntegrationContext[keyof IntegrationContext] => {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const integrationContext = request.integrationContext;

    if (data) {
      return integrationContext[data];
    }

    return integrationContext;
  },
);
