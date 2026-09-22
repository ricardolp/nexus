import { useNavigate } from 'react-router-dom';
import {
  Building2Icon,
  ChevronsUpDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MapIcon,
  UserIcon
} from 'lucide-react';
import { toast } from 'sonner';

import { resolveDisplayName, useAuthStore } from '@/store/auth-store';
import { useProductTourStore } from '@/store/product-tour-store';
import { persistProductTourCompleted } from '@/lib/product-tour';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  system: 'Sistema',
  support: 'Suporte',
  member: 'Membro'
};

function isPlatformStaff(role: string | undefined) {
  return role === 'admin' || role === 'system' || role === 'support';
}

export function NavUser({ profileUrl }: { profileUrl: string }) {
  const { isMobile } = useSidebar();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const requestStart = useProductTourStore((s) => s.requestStart);
  const navigate = useNavigate();
  const organizationUrl = organizationId ? '/app/organization' : null;
  const adminPanelUrl = isPlatformStaff(user?.platformRole) ? '/admin/overview' : null;
  const canRestartTour = Boolean(organizationId && profileUrl.startsWith('/app'));

  if (!user) return null;

  const name = resolveDisplayName(user);

  async function restartTour() {
    if (!token || !user) return;
    try {
      const updated = await persistProductTourCompleted(token, user.appearance, false);
      setUserProfile(updated);
    } catch {
      toast.error('Não foi possível reiniciar o tour.');
      return;
    }
    requestStart();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              data-tour="nav-user"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="text-muted-foreground truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials(name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="text-muted-foreground truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <div className="px-2 py-1">
              <Badge variant="secondary">{roleLabels[user.platformRole] ?? user.platformRole}</Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(profileUrl)}>
              <UserIcon />
              Perfil
            </DropdownMenuItem>
            {organizationUrl && (
              <DropdownMenuItem onClick={() => navigate(organizationUrl)}>
                <Building2Icon />
                Organização
              </DropdownMenuItem>
            )}
            {canRestartTour && (
              <DropdownMenuItem onClick={() => void restartTour()}>
                <MapIcon />
                Ver tour novamente
              </DropdownMenuItem>
            )}
            {adminPanelUrl && profileUrl.startsWith('/app') && (
              <DropdownMenuItem onClick={() => navigate(adminPanelUrl)}>
                <LayoutDashboardIcon />
                Painel admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const loginPath = isPlatformStaff(user.platformRole) ? '/admin/login' : '/login';
                signOut();
                navigate(loginPath);
              }}
            >
              <LogOutIcon />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
