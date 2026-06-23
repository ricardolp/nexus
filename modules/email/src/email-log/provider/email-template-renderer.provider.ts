import { EmailTemplateType } from '../model';

export interface EmailTemplateRendererProvider {
  render(
    template: EmailTemplateType,
    variables: Record<string, string>,
  ): Promise<string>;
}
