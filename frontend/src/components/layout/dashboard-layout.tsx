import { Outlet } from 'react-router-dom';

import type { NavGroup } from '@/config/nav-items';
import { useAuthStore } from '@/store/auth-store';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function DashboardLayout({
  groups,
  profileUrl,
  helpUrl,
  supportUrl,
  homeUrl,
  showOrganization = false
}: {
  groups: NavGroup[];
  profileUrl: string;
  helpUrl: string;
  supportUrl: string;
  homeUrl: string;
  showOrganization?: boolean;
}) {
  const organization = useAuthStore((s) => s.organization);
  const orgLoadError = useAuthStore((s) => s.orgLoadError);

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 64)',
          '--header-height': 'calc(var(--spacing) * 14)'
        } as React.CSSProperties
      }
    >
      <AppSidebar
        groups={groups}
        profileUrl={profileUrl}
        helpUrl={helpUrl}
        supportUrl={supportUrl}
        homeUrl={homeUrl}
        organization={showOrganization ? organization : undefined}
        orgLoadError={showOrganization ? orgLoadError : undefined}
      />
      <SidebarInset>
        <SiteHeader
          groups={groups}
          homeUrl={homeUrl}
          profileUrl={profileUrl}
          helpUrl={helpUrl}
          supportUrl={supportUrl}
        />
        <div data-slot="dashboard-content" className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
