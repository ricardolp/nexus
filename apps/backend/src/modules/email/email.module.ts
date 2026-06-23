import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { EmailController } from './email.controller';
import { FileTemplateRenderer } from './file-template.renderer';
import { NodemailerEmailSender } from './nodemailer.email-sender';
import { PrismaEmailLogRepository } from './email-log.prisma';
import { TransactionalEmailService } from './transactional-email.service';

@Module({
  imports: [DbModule],
  controllers: [EmailController],
  providers: [
    PrismaEmailLogRepository,
    FileTemplateRenderer,
    NodemailerEmailSender,
    TransactionalEmailService,
  ],
  exports: [TransactionalEmailService],
})
export class EmailModule {}
