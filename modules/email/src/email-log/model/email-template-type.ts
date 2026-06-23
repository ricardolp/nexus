export type EmailTemplateType =
  | 'welcome'
  | 'email_confirmation'
  | 'password_reset'
  | 'invite'
  | 'password_changed';

export const EMAIL_TEMPLATE_TYPES: EmailTemplateType[] = [
  'welcome',
  'email_confirmation',
  'password_reset',
  'invite',
  'password_changed',
];

export const EMAIL_TEMPLATE_SUBJECTS: Record<EmailTemplateType, string> = {
  welcome: 'Bem-vindo ao Nexus',
  email_confirmation: 'Confirme seu e-mail',
  password_reset: 'Redefinir sua senha',
  invite: 'Você foi convidado',
  password_changed: 'Sua senha foi alterada',
};
