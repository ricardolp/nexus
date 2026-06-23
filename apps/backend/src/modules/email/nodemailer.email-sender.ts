import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailSenderProvider,
  SendEmailInput,
} from '@nexus/email';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NodemailerEmailSender implements EmailSenderProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>('EMAIL_ENABLED') !== 'false';
    this.from =
      this.configService.get<string>('SMTP_FROM') ??
      'Nexus <noreply@nexus.local>';

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(this.configService.get<string>('SMTP_PORT') ?? 1025),
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
      auth:
        this.configService.get<string>('SMTP_USER') &&
        this.configService.get<string>('SMTP_PASS')
          ? {
              user: this.configService.get<string>('SMTP_USER'),
              pass: this.configService.get<string>('SMTP_PASS'),
            }
          : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  }
}
