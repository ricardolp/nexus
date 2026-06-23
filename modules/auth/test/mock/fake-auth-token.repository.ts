import { PageResult } from '@nexus/shared';
import { AuthToken, AuthTokenType } from '../../src/auth-token/model';
import {
  AuthTokenPageParams,
  AuthTokenRepository,
} from '../../src/auth-token/provider';

export class FakeAuthTokenRepository implements AuthTokenRepository {
  private readonly items = new Map<string, AuthToken>();

  async create(data: AuthToken): Promise<AuthToken> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: AuthToken): Promise<AuthToken> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<AuthToken | null> {
    return this.items.get(id) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<AuthToken | null> {
    return (
      Array.from(this.items.values()).find(
        (token) => token.tokenHash === tokenHash,
      ) ?? null
    );
  }

  async findActiveByEmailAndType(
    email: string,
    tipo: AuthTokenType,
  ): Promise<AuthToken | null> {
    return (
      Array.from(this.items.values()).find(
        (token) =>
          token.email === email &&
          token.tipo === tipo &&
          !token.isUsed() &&
          !token.isExpired(),
      ) ?? null
    );
  }

  async findPage(
    params: AuthTokenPageParams,
  ): Promise<PageResult<AuthToken>> {
    const all = Array.from(this.items.values());
    const start = (params.page - 1) * params.perPage;

    return {
      items: all.slice(start, start + params.perPage),
      page: params.page,
      perPage: params.perPage,
      total: all.length,
    };
  }
}
