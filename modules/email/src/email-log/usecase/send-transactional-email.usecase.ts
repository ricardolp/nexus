import { UseCase } from '@nexus/shared';
import { EmailLog } from '../model';
import { EMAIL_TEMPLATE_SUBJECTS } from '../model/email-template-type';
import {
  EmailLogRepository,
  EmailSenderProvider,
  EmailTemplateRendererProvider,
  SendTransactionalEmailIn,
} from '../provider';

export class SendTransactionalEmail
  implements UseCase<SendTransactionalEmailIn, void>
{
  constructor(
    private readonly emailLogRepository: EmailLogRepository,
    private readonly templateRenderer: EmailTemplateRendererProvider,
    private readonly emailSender: EmailSenderProvider,
  ) {}

  async execute(input: SendTransactionalEmailIn): Promise<void> {
    const assunto = EMAIL_TEMPLATE_SUBJECTS[input.template];

    const emailLog = new EmailLog({
      destinatario: input.to,
      assunto,
      template: input.template,
      status: 'pending',
      metadados: input.metadata ?? null,
    });

    emailLog.validate();

    const createdLog = await this.emailLogRepository.create(emailLog);

    try {
      const html = await this.templateRenderer.render(
        input.template,
        input.variables,
      );

      await this.emailSender.send({
        to: input.to,
        subject: assunto,
        html,
      });

      const sentLog = createdLog.markSent();
      await this.emailLogRepository.update(sentLog);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao enviar e-mail';

      const failedLog = createdLog.markFailed(message);
      await this.emailLogRepository.update(failedLog);

      throw error;
    }
  }
}
