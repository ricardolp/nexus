import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Building2Icon,
  CircleHelpIcon,
  FileBarChartIcon,
  HeadsetIcon,
  MonitorIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  UserIcon
} from 'lucide-react';

import type { NavGroup } from '@/config/nav-items';
import { useAuthStore } from '@/store/auth-store';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  profileUrl,
  helpUrl,
  supportUrl
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  profileUrl: string;
  helpUrl: string;
  supportUrl: string;
}) {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const organizationId = useAuthStore((s) => s.organizationId);
  const organizationUrl = organizationId ? '/app/organization' : null;

  const run = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      fn();
    },
    [onOpenChange]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar páginas, configurações e ações..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem key={item.url} value={item.title} onSelect={() => run(() => navigate(item.url))}>
                <item.icon />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Conta">
          <CommandItem value="Perfil" onSelect={() => run(() => navigate(profileUrl))}>
            <UserIcon />
            Perfil
          </CommandItem>
          {organizationUrl && (
            <CommandItem value="Organização" onSelect={() => run(() => navigate(organizationUrl))}>
              <Building2Icon />
              Organização
            </CommandItem>
          )}
          {organizationUrl && (
            <CommandItem
              value="Consumo organização"
              onSelect={() => run(() => navigate('/app/organization?tab=consumo'))}
            >
              <FileBarChartIcon />
              Consumo
            </CommandItem>
          )}
          {organizationUrl && (
            <CommandItem
              value="Segurança e acesso organização"
              onSelect={() => run(() => navigate('/app/organization?tab=security'))}
            >
              <ShieldCheckIcon />
              Segurança e acesso
            </CommandItem>
          )}
          <CommandItem value="Ajuda" onSelect={() => run(() => navigate(helpUrl))}>
            <CircleHelpIcon />
            Ajuda
          </CommandItem>
          <CommandItem value="Suporte" onSelect={() => run(() => navigate(supportUrl))}>
            <HeadsetIcon />
            Suporte
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tema">
          <CommandItem value="Tema claro" onSelect={() => run(() => setTheme('light'))}>
            <SunIcon />
            Claro
          </CommandItem>
          <CommandItem value="Tema escuro" onSelect={() => run(() => setTheme('dark'))}>
            <MoonIcon />
            Escuro
          </CommandItem>
          <CommandItem value="Tema do sistema" onSelect={() => run(() => setTheme('system'))}>
            <MonitorIcon />
            Sistema
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

