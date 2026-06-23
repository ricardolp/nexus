export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSenderProvider {
  send(input: SendEmailInput): Promise<void>;
}
