import {
  SendTransactionalEmailIn,
  TransactionalEmailProvider,
} from '@nexus/email';

export class FakeTransactionalEmailProvider
  implements TransactionalEmailProvider
{
  readonly sent: SendTransactionalEmailIn[] = [];

  async send(input: SendTransactionalEmailIn): Promise<void> {
    this.sent.push(input);
  }
}
