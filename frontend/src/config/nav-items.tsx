import { ArrowDownToLineIcon, ArrowUpFromLineIcon, ActivityIcon, AlertTriangleIcon, BookOpenIcon, BuildingIcon, HandshakeIcon, InboxIcon, LayoutDashboardIcon,
  ListIcon,
  PackageIcon,
  PlugZapIcon,
  RadioTowerIcon,
  FileBarChartIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon
} from 'lucide-react';

import type { ContractServiceCode } from '@/lib/api-types';

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When set, item is hidden unless the org contract has this service active. */
  serviceCode?: ContractServiceCode;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** When true, the group starts collapsed and expands when opened or when a child is active. */
  collapsible?: boolean;
}

export const adminNavGroups: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { title: 'Visão Geral', url: '/admin/overview', icon: LayoutDashboardIcon },
      { title: 'Requisições', url: '/admin/requests', icon: ListIcon },
      { title: 'Erros', url: '/admin/errors', icon: AlertTriangleIcon },
      { title: 'Status', url: '/admin/status', icon: ActivityIcon },
      { title: 'Distribuição NF-e', url: '/admin/nfe-distribution', icon: RadioTowerIcon },
      { title: 'Consumo', url: '/admin/billing', icon: FileBarChartIcon }
    ]
  },
  {
    label: 'Plataforma',
    items: [
      { title: 'Organizações', url: '/admin/organizations', icon: BuildingIcon },
      { title: 'Usuários', url: '/admin/users', icon: UsersIcon },
      { title: 'FAQ mensagens', url: '/admin/faq', icon: BookOpenIcon },
      { title: 'Perfil', url: '/admin/profile', icon: UserIcon }
    ]
  }
];

export const userNavGroups: NavGroup[] = [
  {
    label: 'Geral',
    items: [
      { title: 'Visão Geral', url: '/app/overview', icon: LayoutDashboardIcon },
      { title: 'E-mails', url: '/app/emails', icon: InboxIcon },
      { title: 'NF-e Entrada', url: '/app/nfe', icon: ArrowDownToLineIcon, serviceCode: 'nfe_inbound' },
      { title: 'NF-e Saída', url: '/app/nfe/saida', icon: ArrowUpFromLineIcon, serviceCode: 'nfe_outbound' },
      { title: 'NFS-e Entrada', url: '/app/nfse', icon: ReceiptTextIcon, serviceCode: 'nfse_inbound' },
      { title: 'NFS-e Saída', url: '/app/nfse/saida', icon: ArrowUpFromLineIcon, serviceCode: 'nfse_outbound' }
    ]
  },
  {
    label: 'Dados Mestres',
    collapsible: true,
    items: [
      { title: 'Parceiros', url: '/app/master-data/partners', icon: HandshakeIcon },
      { title: 'Materiais', url: '/app/master-data/materials', icon: PackageIcon, serviceCode: 'nfe_inbound' }
    ]
  },
  {
    label: 'Configurações',
    items: [
      { title: 'Empresas', url: '/app/settings/companies', icon: BuildingIcon },
      { title: 'Usuários', url: '/app/settings/users', icon: UsersIcon },
      { title: 'Perfis', url: '/app/settings/profiles', icon: ShieldCheckIcon },
      { title: 'Integrações', url: '/app/settings/integrations', icon: PlugZapIcon }
    ]
  }
];

export function filterNavGroupsByServices(
  groups: NavGroup[],
  activeServices: Set<string> | null
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.serviceCode) return true;
        // While loading, keep items visible to avoid sidebar flicker.
        if (activeServices === null) return true;
        return activeServices.has(item.serviceCode);
      })
    }))
    .filter((group) => group.items.length > 0);
}
