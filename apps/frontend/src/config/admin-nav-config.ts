import { NavGroup } from '@/types';

export const adminNavGroups: NavGroup[] = [
  {
    label: 'Administração',
    items: [
      {
        title: 'Indicadores de uso',
        url: '/admin/usage',
        icon: 'trendingUp',
        isActive: false,
        items: [],
        access: { globalAdmin: true },
      },
      {
        title: 'Organizações',
        url: '/admin/organizations',
        icon: 'workspace',
        isActive: false,
        items: [],
        access: { globalAdmin: true },
      },
    ],
  },
];
