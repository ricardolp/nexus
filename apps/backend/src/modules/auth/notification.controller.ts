import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import type { JwtPayload } from '@nexus/auth';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { PrismaUserNotificationRepository } from './user-notification.prisma';

@Controller('me/notifications')
export class NotificationController {
  constructor(
    private readonly notificationRepository: PrismaUserNotificationRepository,
  ) {}

  @Get()
  listNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;
    const parsedOffset = offset ? Number.parseInt(offset, 10) : 0;

    return this.notificationRepository
      .listByUser(user.sub, {
        unreadOnly: unreadOnly === 'true',
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
        offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
      })
      .then((notifications) => ({ notifications }));
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.notificationRepository.countUnread(user.sub);
    return { count };
  }

  @Patch('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.notificationRepository.markAllRead(user.sub);
  }

  @Patch(':notificationId/read')
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    const notification = await this.notificationRepository.markRead(
      user.sub,
      notificationId,
    );

    return { notification };
  }
}
