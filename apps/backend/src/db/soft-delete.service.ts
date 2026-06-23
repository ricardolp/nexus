import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

const activeOnly = {
  deleted_at: null,
} as const;

@Injectable()
export class SoftDeleteService {
  constructor(private readonly prisma: PrismaService) {}

  findActiveUsers(args: Omit<Prisma.UserFindManyArgs, 'where'> & { where?: Prisma.UserWhereInput } = {}) {
    return this.prisma.user.findMany({
      ...args,
      where: {
        ...args.where,
        ...activeOnly,
      },
    });
  }

  findActiveUserById(id: string) {
    return this.prisma.user.findFirst({
      where: {
        id,
        ...activeOnly,
      },
    });
  }

  findActiveLoginAuditsByUserId(userId: string) {
    return this.prisma.userLoginAudit.findMany({
      where: {
        user_id: userId,
        ...activeOnly,
      },
    });
  }

  async softDeleteUser(userId: string, deletedAt: Date = new Date()) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deleted_at: deletedAt },
      }),
      this.prisma.userLoginAudit.updateMany({
        where: {
          user_id: userId,
          deleted_at: null,
        },
        data: { deleted_at: deletedAt },
      }),
    ]);
  }
}
