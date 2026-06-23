import {
  EmailSenderProvider,
  SendEmailInput,
} from '../../src/email-log/provider';

export class FakeEmailSenderProvider implements EmailSenderProvider {
  readonly sent: SendEmailInput[] = [];
  private shouldFail = false;
  private failureMessage = 'SMTP failure';

  failOnNext(message = 'SMTP failure'): void {
    this.shouldFail = true;
    this.failureMessage = message;
  }

  async send(input: SendEmailInput): Promise<void> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error(this.failureMessage);
    }

    this.sent.push(input);
  }
}
