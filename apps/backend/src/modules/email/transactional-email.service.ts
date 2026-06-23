import { Injectable } from '@nestjs/common';
import {
  SendTransactionalEmail,
  SendTransactionalEmailIn,
  TransactionalEmailProvider,
} from '@nexus/email';
import { FileTemplateRenderer } from './file-template.renderer';
import { NodemailerEmailSender } from './nodemailer.email-sender';
import { PrismaEmailLogRepository } from './email-log.prisma';

@Injectable()
export class TransactionalEmailService implements TransactionalEmailProvider {
  constructor(
    private readonly emailLogRepository: PrismaEmailLogRepository,
    private readonly templateRenderer: FileTemplateRenderer,
    private readonly emailSender: NodemailerEmailSender,
  ) {}

  async send(input: SendTransactionalEmailIn): Promise<void> {
    const useCase = new SendTransactionalEmail(
      this.emailLogRepository,
      this.templateRenderer,
      this.emailSender,
    );

    await useCase.execute(input);
  }
}
