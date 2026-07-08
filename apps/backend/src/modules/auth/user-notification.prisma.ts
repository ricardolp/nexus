import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

export type NotificationAction =
  | { kind: 'navigate'; path: string }
  | {
      kind: 'entity';
      entity: string;
      organizationId?: string;
      companyId?: string;
      certificateId?: string;
      [key: string]: string | undefined;
    };

export type UserNotificationRecord = {
  id: string;
  title: string;
  description: string;
  action: NotificationAction | null;
  category: string | null;
  readAt: string | null;
  createdAt: string;
};

@Injectable()
export class PrismaUserNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<UserNotificationRecord[]> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where: Prisma.UserNotificationWhereInput = { user_id: userId };

    if (opts.unreadOnly) {
      where.read_at = null;
    }

    const rows = await this.prisma.userNotification.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toRecord(row));
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.userNotification.count({
      where: { user_id: userId, read_at: null },
    });
  }

  async markRead(userId: string, notificationId: string): Promise<UserNotificationRecord> {
    const existing = await this.prisma.userNotification.findFirst({
      where: { id: notificationId, user_id: userId },
    });

    if (!existing) {
      throw new NotFoundException('Notificação não encontrada');
    }

    const row = await this.prisma.userNotification.update({
      where: { id: notificationId },
      data: { read_at: new Date() },
    });

    return this.toRecord(row);
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.userNotification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });

    return result.count;
  }

  private toRecord(row: {
    id: string;
    title: string;
    description: string;
    action: Prisma.JsonValue;
    category: string | null;
    read_at: Date | null;
    created_at: Date;
  }): UserNotificationRecord {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      action: (row.action as NotificationAction | null) ?? null,
      category: row.category,
      readAt: row.read_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }
}
