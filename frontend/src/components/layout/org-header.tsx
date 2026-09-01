import { useState } from 'react';
import { Building2Icon } from 'lucide-react';

import { NexusMark } from '@/components/brand/nexus-mark';

import type { ApiOrganization } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

function orgInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Known tenant marks shipped with the app. API `logo_url` always wins. */
const ORG_LOGO_BY_SLUG: Record<string, string> = {
  'ls-mtron-brasil': '/logos/ls-mtron.jpg',
  'ls-mtron': '/logos/ls-mtron.jpg'
};

function orgLogoSrc(organization: ApiOrganization) {
  const fromApi = organization.logo_url?.trim();
  if (fromApi) return fromApi;
  return ORG_LOGO_BY_SLUG[organization.slug];
}

export function OrganizationMark({
  organization,
  displayName,
  size = 'sm'
}: {
  organization: ApiOrganization;
  displayName: string;
  size?: 'sm' | 'lg';
}) {
  const src = orgLogoSrc(organization);
  const [failed, setFailed] = useState(false);
  const box = size === 'lg' ? 'size-16 text-lg' : 'size-8 text-xs';
  if (src && !failed) {
    return (
      <div className={`flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[#0b1d4a] ${box}`}>
        <img
          src={src}
          alt=""
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={`bg-primary text-primary-foreground flex aspect-square items-center justify-center rounded-lg font-semibold ${box}`}
    >
      {orgInitials(displayName)}
    </div>
  );
}

const statusLabels: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  inactive: 'Inativa'
};

export function OrgHeader({
  organization,
  loadError
}: {
  organization: ApiOrganization | null;
  loadError: string | null;
}) {
  if (!organization) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="cursor-default">
            <div className="flex aspect-square size-8 items-center justify-center">
              <NexusMark size={32} />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Nexus</span>
              <span className="text-muted-foreground truncate text-xs">
                {loadError ? 'Organização indisponível' : 'Carregando organização...'}
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const displayName = organization.trade_name || organization.legal_name;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <OrganizationMark organization={organization} displayName={displayName} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="text-muted-foreground truncate text-xs">{organization.slug}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <OrganizationMark organization={organization} displayName={displayName} />
              <div className="grid flex-1 leading-tight">
                <span className="truncate font-medium">{organization.legal_name}</span>
                {organization.tax_identifier && (
                  <span className="text-muted-foreground truncate text-xs">
                    CNPJ {organization.tax_identifier}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Building2Icon className="size-3.5" />
                Organização
              </span>
              <Badge variant="outline">{statusLabels[organization.status] ?? organization.status}</Badge>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
