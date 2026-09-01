import { useState } from 'react';

import type { NavGroup } from '@/config/nav-items';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { AppBreadcrumb } from '@/components/layout/app-breadcrumb';
import { CommandPalette } from '@/components/layout/command-palette';
import { NotificationBell } from '@/components/layout/notification-bell';
import { SearchInput } from '@/components/layout/search-input';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export function SiteHeader({
  groups,
  homeUrl,
  profileUrl,
  helpUrl,
  supportUrl
}: {
  groups: NavGroup[];
  homeUrl: string;
  profileUrl: string;
  helpUrl: string;
  supportUrl: string;
}) {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <div className="min-w-0 flex-1">
          <AppBreadcrumb homeUrl={homeUrl} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SearchInput onOpen={() => setCommandOpen(true)} />
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        groups={groups}
        profileUrl={profileUrl}
        helpUrl={helpUrl}
        supportUrl={supportUrl}
      />
    </header>
  );
}
