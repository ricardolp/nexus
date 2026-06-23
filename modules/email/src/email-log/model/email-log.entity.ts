import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import { EmailLogStatus, EMAIL_LOG_STATUSES } from './email-log-status';
import { EmailTemplateType, EMAIL_TEMPLATE_TYPES } from './email-template-type';

export interface EmailLogState extends EntityState {
  destinatario: string;
  assunto: string;
  template: EmailTemplateType;
  status: EmailLogStatus;
  erro?: string | null;
  metadados?: Record<string, unknown> | null;
  enviadoEm?: Date | null;
}

export class EmailLog extends Entity<EmailLogState> {
  constructor(props: EmailLogState) {
    super(props);
  }

  get destinatario(): string {
    return this.props.destinatario;
  }

  get assunto(): string {
    return this.props.assunto;
  }

  get template(): EmailTemplateType {
    return this.props.template;
  }

  get status(): EmailLogStatus {
    return this.props.status;
  }

  get erro(): string | null | undefined {
    return this.props.erro;
  }

  get metadados(): Record<string, unknown> | null | undefined {
    return this.props.metadados;
  }

  get enviadoEm(): Date | null | undefined {
    return this.props.enviadoEm;
  }

  public markSent(enviadoEm: Date = new Date()): EmailLog {
    return new EmailLog({
      ...this.props,
      status: 'sent',
      enviadoEm,
      erro: null,
      updatedAt: new Date(),
    });
  }

  public markFailed(erro: string): EmailLog {
    return new EmailLog({
      ...this.props,
      status: 'failed',
      erro,
      updatedAt: new Date(),
    });
  }

  public validate(): void {
    Validator.validate([
      {
        code: 'emailLog.destinatario',
        value: this.destinatario,
        rules: [new RequiredRule()],
      },
      {
        code: 'emailLog.assunto',
        value: this.assunto,
        rules: [new RequiredRule()],
      },
      {
        code: 'emailLog.template',
        value: this.template,
        rules: [new RequiredRule(), new InRule(EMAIL_TEMPLATE_TYPES)],
      },
      {
        code: 'emailLog.status',
        value: this.status,
        rules: [new RequiredRule(), new InRule(EMAIL_LOG_STATUSES)],
      },
    ]);
  }
}
