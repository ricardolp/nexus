import { EmailTemplateType } from '../model';

export interface SendTransactionalEmailIn {
  template: EmailTemplateType;
  to: string;
  variables: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface TransactionalEmailProvider {
  send(input: SendTransactionalEmailIn): Promise<void>;
}
