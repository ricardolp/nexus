import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  EmailTemplateRendererProvider,
  EmailTemplateType,
} from '@nexus/email';

const TEMPLATE_FILE_NAMES: Record<EmailTemplateType, string> = {
  welcome: 'welcome.html',
  email_confirmation: 'email-confirmation.html',
  password_reset: 'password-reset.html',
  invite: 'invite.html',
  password_changed: 'password-changed.html',
};

@Injectable()
export class FileTemplateRenderer implements EmailTemplateRendererProvider {
  private readonly templatesDir = join(__dirname, 'templates');

  async render(
    template: EmailTemplateType,
    variables: Record<string, string>,
  ): Promise<string> {
    const fileName = TEMPLATE_FILE_NAMES[template];
    const filePath = join(this.templatesDir, fileName);
    const content = await readFile(filePath, 'utf-8');

    return Object.entries(variables).reduce((html, [key, value]) => {
      return html.replaceAll(`{{${key}}}`, value);
    }, content);
  }
}
