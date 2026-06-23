import { EmailTemplateType } from '../../src/email-log/model';
import { EmailTemplateRendererProvider } from '../../src/email-log/provider';

export class FakeEmailTemplateRendererProvider
  implements EmailTemplateRendererProvider
{
  async render(
    template: EmailTemplateType,
    variables: Record<string, string>,
  ): Promise<string> {
    const vars = Object.entries(variables)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');

    return `<html data-template="${template}" data-vars="${vars}"></html>`;
  }
}
