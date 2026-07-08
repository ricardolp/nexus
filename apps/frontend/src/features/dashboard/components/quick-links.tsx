'use client';

import { Icons } from '@/components/icons';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

const links = [
  {
    title: 'Notas Fiscais',
    description: 'Consulte, importe e acompanhe NF-e da organização.',
    href: '/dashboard/documents/nfe',
    icon: Icons.post,
  },
  {
    title: 'Eventos',
    description: 'Eventos vinculados às notas fiscais eletrônicas.',
    href: '/dashboard/documents/nfe/events',
    icon: Icons.forms,
  },
  {
    title: 'Configuração de Fluxo',
    description: 'Defina etapas e regras do fluxo inbound de NF-e.',
    href: '/dashboard/documents/nfe/flow-config',
    icon: Icons.settings,
  },
  {
    title: 'Integração SAP',
    description: 'Conecte pedidos, entregas e documentos fiscais ao SAP.',
    href: '/dashboard/integrations/sap',
    icon: Icons.settings,
  },
  {
    title: 'Webhooks',
    description: 'Receba eventos de documentos e integrações em tempo real.',
    href: '/dashboard/integrations/webhooks',
    icon: Icons.notification,
  },
  {
    title: 'Empresas',
    description: 'Gerencie CNPJs e filiais da organização.',
    href: '/dashboard/organization/companies',
    icon: Icons.product,
  },
] as const;

export function QuickLinks() {
  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link key={link.href} href={link.href} className='group block h-full'>
            <Card className='h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/30'>
              <CardHeader className='gap-3'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
                    <Icon className='size-4' />
                  </div>
                  <Icons.arrowRight className='text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100' />
                </div>
                <div className='space-y-1'>
                  <CardTitle className='text-base'>{link.title}</CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
