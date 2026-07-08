import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      {
        title: 'Início',
        url: '/dashboard/overview',
        icon: 'dashboard',
        access: { requireOrg: true },
      },
    ],
  },
  {
    label: 'Documentos',
    items: [
      {
        title: 'Notas Fiscais',
        url: '/dashboard/documents/nfe',
        icon: 'post',
        access: { requireOrg: true },
      },
      {
        title: 'Eventos',
        url: '/dashboard/documents/nfe/events',
        icon: 'forms',
        access: { requireOrg: true },
      },
      {
        title: 'Configuração de Fluxo',
        url: '/dashboard/documents/nfe/flow-config',
        icon: 'settings',
        access: { requireOrg: true },
      },
    ],
  },
  {
    label: 'Integrações',
    items: [
      {
        title: 'Tokens de API',
        url: '/dashboard/integrations/tokens',
        icon: 'code',
        access: { requireOrg: true },
      },
      {
        title: 'Webhooks',
        url: '/dashboard/integrations/webhooks',
        icon: 'notification',
        access: { requireOrg: true },
      },
      {
        title: 'SAP',
        url: '/dashboard/integrations/sap',
        icon: 'settings',
        access: { requireOrg: true },
      },
    ],
  },
  {
    label: 'Organização',
    items: [
      {
        title: 'Usuários',
        url: '/dashboard/organization/members',
        icon: 'teams',
        access: { requireOrg: true },
      },
      {
        title: 'Empresas',
        url: '/dashboard/organization/companies',
        icon: 'product',
        access: { requireOrg: true },
      },
      {
        title: 'Perfis',
        url: '/dashboard/organization/roles',
        icon: 'lock',
        access: { requireOrg: true },
      },
    ],
  },
];
