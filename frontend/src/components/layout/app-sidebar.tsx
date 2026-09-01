import { useQuery } from '@tanstack/react-query';
import { CircleHelpIcon, HeadsetIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { NexusMark } from '@/components/brand/nexus-mark';
import type { NavGroup } from '@/config/nav-items';
import type { ApiOrganization } from '@/lib/api-types';
import { listPendingFiscalDocuments } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { NavUser } from '@/components/layout/nav-user';
import { OrgHeader } from '@/components/layout/org-header';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';

// Only the member/app sidebar ever has an organizationId (admin sessions
// keep it null — see store/auth-store.ts) so this query is naturally a
// no-op there; same cache key as fiscal-documents-page.tsx's pending query
// so navigating there doesn't refetch.
const PENDING_MANIFESTATION_NAV_URL = '/app/nfe';

export function AppSidebar({
  groups,
  profileUrl,
  helpUrl,
  supportUrl,
  homeUrl,
  organization,
  orgLoadError
}: {
  groups: NavGroup[];
  profileUrl: string;
  helpUrl: string;
  supportUrl: string;
  homeUrl: string;
  organization?: ApiOrganization | null;
  orgLoadError?: string | null;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);

  const pendingQuery = useQuery({
    queryKey: ['fiscal-documents-pending', organizationId],
    queryFn: () => listPendingFiscalDocuments(token!, organizationId!, 200),
    enabled: !!token && !!organizationId
  });
  const pendingManifestationCount =
    pendingQuery.data?.items.filter((d) => d.status === 'pending').length ?? 0;

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        {organization !== undefined ? (
          <OrgHeader organization={organization} loadError={orgLoadError ?? null} />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <NavLink to={homeUrl}>
                  <div className="flex aspect-square size-8 items-center justify-center">
                    <NexusMark size={32} />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Nexus</span>
                    <span className="truncate text-xs">Dashboard</span>
                  </div>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        className={({ isActive }) => (isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : '')}
                      >
                        <item.icon />
                        <span className="flex-1">{item.title}</span>
                        {item.url === PENDING_MANIFESTATION_NAV_URL && pendingManifestationCount > 0 && (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            {pendingManifestationCount}
                          </Badge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Suporte">
              <NavLink
                to={supportUrl}
                className={({ isActive }) => (isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : '')}
              >
                <HeadsetIcon />
                <span>Suporte</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ajuda">
              <NavLink
                to={helpUrl}
                className={({ isActive }) => (isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : '')}
              >
                <CircleHelpIcon />
                <span>Ajuda</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser profileUrl={profileUrl} />
      </SidebarFooter>
    </Sidebar>
  );
}
