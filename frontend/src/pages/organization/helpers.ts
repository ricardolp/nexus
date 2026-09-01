import type { ApiAuthSettings } from '@/lib/api-types';

export const statusLabels: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  inactive: 'Inativa'
};

export const locales = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' }
] as const;

export function formatTaxId(value?: string | null) {
  if (!value?.trim()) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function localeLabel(value?: string | null) {
  return locales.find((item) => item.value === value)?.label ?? value ?? '—';
}

export function passwordComplexityLabel(settings: ApiAuthSettings) {
  const parts: string[] = [`${settings.min_password_length}+ caracteres`];
  if (settings.require_uppercase && settings.require_lowercase) parts.push('maiúsculas e minúsculas');
  else if (settings.require_uppercase) parts.push('maiúsculas');
  else if (settings.require_lowercase) parts.push('minúsculas');
  if (settings.require_number) parts.push('números');
  if (settings.require_special) parts.push('símbolos');
  const strong =
    settings.min_password_length >= 12 &&
    settings.require_uppercase &&
    settings.require_lowercase &&
    settings.require_number &&
    settings.require_special;
  return `${strong ? 'Forte' : 'Personalizada'} — ${parts.join(', ')}`;
}

export function sessionTimeoutLabel(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return `${minutes} minutos`;
}
