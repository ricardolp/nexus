import { NavGroup } from '@/types';

export const adminNavGroups: NavGroup[] = [
  {
    label: 'Administração',
    items: [
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
