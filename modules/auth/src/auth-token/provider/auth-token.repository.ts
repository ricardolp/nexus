import { CrudRepository } from '@nexus/shared';
import { AuthToken, AuthTokenType } from '../model';

export interface AuthTokenPageParams {
  page: number;
  perPage: number;
}

export interface AuthTokenRepository
  extends CrudRepository<AuthToken, AuthToken, AuthToken, AuthTokenPageParams> {
  findByTokenHash(tokenHash: string): Promise<AuthToken | null>;
  findActiveByEmailAndType(
    email: string,
    tipo: AuthTokenType,
  ): Promise<AuthToken | null>;
}
