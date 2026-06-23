import { NotFoundError, PageResult, UseCase } from '@nexus/shared';
import { IntegrationToken } from '../model';
import {
  IntegrationTokenPageParams,
  IntegrationTokenRepository,
} from '../provider';

export class FindIntegrationTokenPage
  implements UseCase<IntegrationTokenPageParams, PageResult<IntegrationToken>>
{
  constructor(
    private readonly integrationTokenRepository: IntegrationTokenRepository,
  ) {}

  execute(params: IntegrationTokenPageParams) {
    return this.integrationTokenRepository.findPage(params);
  }
}

export interface RevokeIntegrationTokenIn {
  organizationId: string;
  tokenId: string;
}

export class RevokeIntegrationToken
  implements UseCase<RevokeIntegrationTokenIn, IntegrationToken>
{
  constructor(
    private readonly integrationTokenRepository: IntegrationTokenRepository,
  ) {}

  async execute(input: RevokeIntegrationTokenIn): Promise<IntegrationToken> {
    const token = await this.integrationTokenRepository.findById(input.tokenId);

    if (!token || token.organizationId !== input.organizationId) {
      throw new NotFoundError('Token de integração não encontrado');
    }

    if (token.isRevoked()) {
      return token;
    }

    const revoked = token.revoke();
    return this.integrationTokenRepository.update(revoked);
  }
}

export interface FindIntegrationTokenByHashIn {
  tokenHash: string;
}

export class FindIntegrationTokenByHash
  implements UseCase<FindIntegrationTokenByHashIn, IntegrationToken | null>
{
  constructor(
    private readonly integrationTokenRepository: IntegrationTokenRepository,
  ) {}

  execute(input: FindIntegrationTokenByHashIn) {
    return this.integrationTokenRepository.findByTokenHash(input.tokenHash);
  }
}

export interface TouchIntegrationTokenIn {
  tokenId: string;
}

export class TouchIntegrationToken
  implements UseCase<TouchIntegrationTokenIn, void>
{
  constructor(
    private readonly integrationTokenRepository: IntegrationTokenRepository,
  ) {}

  async execute(input: TouchIntegrationTokenIn): Promise<void> {
    const token = await this.integrationTokenRepository.findById(input.tokenId);

    if (!token || token.isRevoked()) {
      return;
    }

    await this.integrationTokenRepository.update(token.touchLastUsed());
  }
}
