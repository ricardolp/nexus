import { PageResult } from '@nexus/shared';
import { IntegrationToken } from '../model';

export interface IntegrationTokenPageParams {
  organizationId: string;
  page: number;
  perPage: number;
}

export interface IntegrationTokenRepository {
  create(data: IntegrationToken): Promise<IntegrationToken>;
  update(data: IntegrationToken): Promise<IntegrationToken>;
  findById(id: string): Promise<IntegrationToken | null>;
  findByTokenHash(tokenHash: string): Promise<IntegrationToken | null>;
  findPage(
    params: IntegrationTokenPageParams,
  ): Promise<PageResult<IntegrationToken>>;
  touch(id: string): Promise<void>;
}
