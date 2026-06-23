import {
  generateRawToken,
  hashToken,
  UseCase,
  ValidationError,
} from '@nexus/shared';
import { IntegrationToken } from '../model';
import { IntegrationTokenRepository } from '../provider';
import {
  INTEGRATION_TOKEN_PREFIX,
  buildIntegrationTokenSecret,
} from '../../shared';

export interface CreateIntegrationTokenIn {
  organizationId: string;
  name: string;
  scopes: string[];
  createdByUserId: string;
  expiresAt?: Date | null;
}

export interface CreateIntegrationTokenOut {
  token: IntegrationToken;
  secret: string;
}

export class CreateIntegrationToken
  implements UseCase<CreateIntegrationTokenIn, CreateIntegrationTokenOut>
{
  constructor(
    private readonly integrationTokenRepository: IntegrationTokenRepository,
  ) {}

  async execute(
    input: CreateIntegrationTokenIn,
  ): Promise<CreateIntegrationTokenOut> {
    if (!input.scopes.length) {
      throw new ValidationError('Informe ao menos um escopo para o token');
    }

    const randomPart = generateRawToken();
    const secret = buildIntegrationTokenSecret(
      INTEGRATION_TOKEN_PREFIX,
      randomPart,
    );
    const tokenPrefix = secret.slice(0, 16);

    const token = new IntegrationToken({
      organizationId: input.organizationId,
      name: input.name,
      tokenPrefix,
      tokenHash: hashToken(secret),
      scopes: input.scopes,
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt ?? null,
    });

    token.validate();

    const created = await this.integrationTokenRepository.create(token);

    return { token: created, secret };
  }
}
