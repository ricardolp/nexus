export type AuthTokenType =
  | 'email_confirmation'
  | 'password_reset'
  | 'invite';

export const AUTH_TOKEN_TYPES: AuthTokenType[] = [
  'email_confirmation',
  'password_reset',
  'invite',
];
