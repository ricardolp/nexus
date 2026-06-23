import { PageResult } from '@nexus/shared';
import { EmailLog } from '../../src/email-log/model';
import {
  EmailLogPageParams,
  EmailLogRepository,
} from '../../src/email-log/provider';

export class FakeEmailLogRepository implements EmailLogRepository {
  private readonly items = new Map<string, EmailLog>();

  async create(data: EmailLog): Promise<EmailLog> {
    this.items.set(data.id, data);
    return data;
  }

  async update(data: EmailLog): Promise<EmailLog> {
    this.items.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async findById(id: string): Promise<EmailLog | null> {
    return this.items.get(id) ?? null;
  }

  async findPage(
    params: EmailLogPageParams,
  ): Promise<PageResult<EmailLog>> {
    const all = Array.from(this.items.values());
    const start = (params.page - 1) * params.perPage;
    const items = all.slice(start, start + params.perPage);

    return {
      items,
      page: params.page,
      perPage: params.perPage,
      total: all.length,
    };
  }
}
