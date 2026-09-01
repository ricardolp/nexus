import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Dashboard',
  app: 'Dashboard',
  overview: 'Visão Geral',
  users: 'Usuários',
  organizations: 'Organizações',
  requests: 'Requisições',
  errors: 'Erros',
  status: 'Status',
  profile: 'Perfil',
  organization: 'Organização',
  help: 'Ajuda',
  support: 'Suporte',
  profiles: 'Perfis',
  nfe: 'NF-e Entrada',
  saida: 'NF-e Saída',
  nfse: 'NFSe',
  settings: 'Configurações',
  companies: 'Empresas',
  integrations: 'Integrações',
  'process-flows': 'Fluxos de processo',
  security: 'Segurança e acesso',
  'nfe-distribution': 'Distribuição NF-e',
  billing: 'Consumo',
  new: 'Novo'
};

function labelFor(segment: string, isLast: boolean, previous?: string) {
  if (/^[0-9a-f-]{8,}$/i.test(segment)) {
    if (previous === 'companies') return 'Empresa';
    return isLast ? 'Detalhe' : 'Item';
  }
  return SEGMENT_LABELS[segment] ?? decodeURIComponent(segment.replace(/-/g, ' '));
}

export function AppBreadcrumb({ homeUrl }: { homeUrl: string }) {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const items = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    const isLast = index === segments.length - 1;
    const title = index === 0 ? 'Dashboard' : labelFor(segment, isLast, segments[index - 1]);
    const to = index === 0 ? homeUrl : href;
    return { href: to, title, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          <Fragment key={`${item.href}-${index}`}>
            <BreadcrumbItem>
              {item.isLast ? (
                <BreadcrumbPage>{item.title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={item.href}>{item.title}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!item.isLast && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
