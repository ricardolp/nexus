import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  ActivityIcon,
  AlertTriangleIcon,
  BuildingIcon,
  LayoutDashboardIcon,
  ListIcon,
  PlugZapIcon,
  RadioTowerIcon,
  FileBarChartIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon
} from 'lucide-react';

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
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
      { title: 'Usuários', url: '/admin/users', icon: UsersIcon },
      { title: 'Perfil', url: '/admin/profile', icon: UserIcon }
    ]
  }
];

export const userNavGroups: NavGroup[] = [
  {
    label: 'Geral',
    items: [
      { title: 'Visão Geral', url: '/app/overview', icon: LayoutDashboardIcon },
      { title: 'NF-e Entrada', url: '/app/nfe', icon: ArrowDownToLineIcon },
      { title: 'NF-e Saída', url: '/app/nfe/saida', icon: ArrowUpFromLineIcon },
      { title: 'Notas Fiscais Serviço (NFSE)', url: '/app/nfse', icon: ReceiptTextIcon }
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
