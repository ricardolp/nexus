import type { ApiSecurityEvent, ApiSession } from '@/lib/api-types';

export const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  system: 'Sistema',
  support: 'Suporte',
  member: 'Membro'
};

export const timezones = [
  { value: 'America/Sao_Paulo', label: 'Horário de Brasília (GMT−3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT−3)' },
  { value: 'America/Recife', label: 'Recife (GMT−3)' },
  { value: 'America/Belem', label: 'Belém (GMT−3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT−4)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT−4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (GMT−4)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT−2)' },
  { value: 'UTC', label: 'UTC' }
];

export type EventCategory = 'login' | 'security' | 'settings' | 'other';
export type EventSeverity = 'critical' | 'warning' | 'info';

type EventMeta = {
  title: string;
  category: EventCategory;
  severity: EventSeverity;
  description: string;
};

const eventCatalog: Record<string, EventMeta> = {
  'login.success': {
    title: 'Login bem-sucedido',
    category: 'login',
    severity: 'info',
    description: 'Sessão autenticada com sucesso neste dispositivo.'
  },
  'login.failure': {
    title: 'Falha de login',
    category: 'login',
    severity: 'critical',
    description: 'A autenticação falhou. Se não foi você, altere a senha.'
  },
  'mfa.enabled': {
    title: 'Autenticação em dois fatores ativada',
    category: 'security',
    severity: 'info',
    description: '2FA por aplicativo autenticador foi confirmado. Códigos de recuperação gerados.'
  },
  'mfa.disabled': {
    title: 'Autenticação em dois fatores desativada',
    category: 'security',
    severity: 'warning',
    description: 'O 2FA foi removido desta conta. A proteção extra deixou de valer.'
  },
  'password.changed': {
    title: 'Senha alterada',
    category: 'security',
    severity: 'info',
    description: 'A senha da conta foi atualizada.'
  },
  'password.admin_set': {
    title: 'Senha redefinida por um administrador',
    category: 'security',
    severity: 'warning',
    description: 'Um administrador definiu uma nova senha. As sessões ativas foram encerradas.'
  },
  'session.revoked': {
    title: 'Sessão encerrada',
    category: 'security',
    severity: 'info',
    description: 'Uma sessão foi revogada e o dispositivo perdeu o acesso.'
  }
};

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function eventMeta(type: string): EventMeta {
  return (
    eventCatalog[type] ?? {
      title: type,
      category: 'other',
      severity: 'info',
      description: 'Evento registrado na conta.'
    }
  );
}

export type DeviceKind = 'laptop' | 'phone' | 'tablet' | 'desktop';

function matchVersion(ua: string, pattern: RegExp) {
  return ua.match(pattern)?.[1] ?? '';
}

export function parseUserAgent(ua?: string | null) {
  if (!ua?.trim()) {
    return {
      browser: 'Desconhecido',
      os: '—',
      device: 'Dispositivo desconhecido',
      kind: 'laptop' as DeviceKind,
      browserDetail: 'Navegador desconhecido',
      osDetail: '—'
    };
  }
  const value = ua.toLowerCase();
  let browser = 'Navegador';
  let browserVersion = '';
  if (value.includes('edg/')) {
    browser = 'Edge';
    browserVersion = matchVersion(ua, /Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)?)/i);
  } else if (value.includes('chrome/')) {
    browser = 'Chrome';
    browserVersion = matchVersion(ua, /Chrome\/(\d+(?:\.\d+)?)/i);
  } else if (value.includes('firefox/')) {
    browser = 'Firefox';
    browserVersion = matchVersion(ua, /Firefox\/(\d+(?:\.\d+)?)/i);
  } else if (value.includes('safari/')) {
    browser = 'Safari';
    browserVersion = matchVersion(ua, /Version\/(\d+(?:\.\d+)?).*Safari/i);
  } else if (value.includes('curl/')) {
    browser = 'curl';
  }

  let os = '—';
  let osDetail = '—';
  if (value.includes('windows')) {
    os = 'Windows';
    osDetail = 'Windows';
  } else if (value.includes('ipad')) {
    os = 'iPadOS';
    osDetail = 'iPadOS';
  } else if (value.includes('iphone')) {
    os = 'iOS';
    osDetail = 'iOS';
  } else if (value.includes('mac os') || value.includes('macintosh')) {
    os = 'macOS';
    osDetail = 'macOS';
  } else if (value.includes('android')) {
    os = 'Android';
    osDetail = 'Android';
  } else if (value.includes('linux')) {
    os = 'Linux';
    osDetail = 'Linux';
  }

  let kind: DeviceKind = 'laptop';
  if (value.includes('ipad') || value.includes('tablet')) kind = 'tablet';
  else if (value.includes('iphone') || value.includes('android') || value.includes('mobile')) kind = 'phone';
  else if (value.includes('windows')) kind = 'desktop';

  const browserDetail = browserVersion ? `${browser} ${browserVersion}` : browser;
  return { browser, os, device: `${browser} no ${os}`, kind, browserDetail, osDetail };
}

export function sessionDeviceName(session: ApiSession) {
  if (session.device_label?.trim()) return session.device_label.trim();
  const parsed = parseUserAgent(session.user_agent);
  const ua = session.user_agent?.toLowerCase() ?? '';
  if (parsed.kind === 'phone') {
    if (ua.includes('iphone')) return 'iPhone';
    if (parsed.os === 'Android') return 'Android';
    return 'Celular';
  }
  if (parsed.kind === 'tablet') {
    if (ua.includes('ipad')) return 'iPad';
    return 'Tablet';
  }
  if (parsed.os === 'Windows') return 'Windows Desktop';
  if (parsed.os === 'macOS') return 'Mac';
  if (parsed.os === 'Linux') return 'Linux';
  return parsed.device;
}

export function sessionLabel(session: ApiSession) {
  return sessionDeviceName(session);
}

export function formatDuration(from: string, to: string) {
  const ms = Math.max(0, new Date(to).getTime() - new Date(from).getTime());
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function dayGroupLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Hoje';
  if (sameDay(date, yesterday)) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function groupEventsByDay(events: ApiSecurityEvent[]) {
  const groups: { label: string; items: ApiSecurityEvent[] }[] = [];
  for (const event of events) {
    const label = dayGroupLabel(event.occurred_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(event);
    else groups.push({ label, items: [event] });
  }
  return groups;
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export const accentSwatches = [
  { id: 'violet', label: 'Violeta', className: 'bg-[oklch(0.52_0.22_292)]' },
  { id: 'blue', label: 'Azul', className: 'bg-[oklch(0.55_0.2_264)]' },
  { id: 'magenta', label: 'Magenta', className: 'bg-[oklch(0.65_0.22_340)]' },
  { id: 'teal', label: 'Teal', className: 'bg-[oklch(0.55_0.12_180)]' },
  { id: 'amber', label: 'Âmbar', className: 'bg-[oklch(0.72_0.16_75)]' }
] as const;

export type AppearancePrefs = {
  theme?: string;
  density?: string;
  font_size?: string;
  accent?: string;
};

export type NotificationPrefs = {
  product_email?: boolean;
  security_email?: boolean;
  changelog_email?: boolean;
  feature_email?: boolean;
  marketing_email?: boolean;
  team_email?: boolean;
};
