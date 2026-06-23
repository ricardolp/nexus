import { PageResult } from '@nexus/shared';
import { User } from '../../src/user/model';
import { UserPageParams, UserRepository } from '../../src/user/provider';

export class FakeUserRepository implements UserRepository {
  private readonly items = new Map<string, User>();

  async create(data: User): Promise<User> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: User): Promise<User> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<User | null> {
    return this.items.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return (
      Array.from(this.items.values()).find((user) => user.email === email) ??
      null
    );
  }

  async findPage(params: UserPageParams): Promise<PageResult<User>> {
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
