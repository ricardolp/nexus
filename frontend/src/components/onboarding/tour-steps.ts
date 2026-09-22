export type TourStepDef = {
  id: string;
  /** Navigate here before highlighting (pathname + optional search). */
  route?: string;
  /** CSS selector, typically `[data-tour="..."]`. */
  element?: string;
  title: string;
  description: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
};

const FISCAL_NAV_URLS = ['/app/nfe', '/app/nfe/saida', '/app/nfse', '/app/nfse/saida'] as const;

export function firstFiscalNavUrl(activeServices: Set<string> | null): string | null {
  if (!activeServices || activeServices.size === 0) return null;
  const byService: Record<string, string> = {
    nfe_inbound: '/app/nfe',
    nfe_outbound: '/app/nfe/saida',
    nfse_inbound: '/app/nfse',
    nfse_outbound: '/app/nfse/saida'
  };
  for (const code of ['nfe_inbound', 'nfe_outbound', 'nfse_inbound', 'nfse_outbound']) {
    if (activeServices.has(code)) return byService[code] ?? null;
  }
  return null;
}

export function isFiscalNavUrl(url: string) {
  return (FISCAL_NAV_URLS as readonly string[]).includes(url);
}

export function navTourIdForUrl(url: string): string | undefined {
  switch (url) {
    case '/app/overview':
      return 'nav-overview';
    case '/app/settings/companies':
      return 'nav-companies';
    case '/app/settings/users':
      return 'nav-users';
    case '/app/settings/profiles':
      return 'nav-profiles';
    case '/app/settings/integrations':
      return 'nav-integrations';
    case '/app/master-data/partners':
      return 'nav-partners';
    case '/app/master-data/materials':
      return 'nav-materials';
    default:
      if (isFiscalNavUrl(url)) return undefined; // assigned dynamically to first fiscal item
      return undefined;
  }
}

export function buildTourSteps(opts: {
  fiscalRoute: string | null;
  certificateRoute: string | null;
}): TourStepDef[] {
  const steps: TourStepDef[] = [
    {
      id: 'welcome',
      route: '/app/overview',
      element: '[data-tour="nav-overview"]',
      title: 'Bem-vindo ao Nexus',
      description:
        'Este tour rápido mostra organização, empresas, notas, usuários, integrações, seu perfil e o suporte. Você pode pular a qualquer momento.',
      side: 'right'
    },
    {
      id: 'org-menu',
      element: '[data-tour="nav-user"]',
      title: 'Organização',
      description:
        'Pelo menu do usuário (aqui embaixo) você acessa a Organização: dados cadastrais, consumo, e-mail e segurança.',
      side: 'right',
      align: 'end'
    },
    {
      id: 'org-page',
      route: '/app/organization',
      element: '[data-tour="org-page"]',
      title: 'Dados da organização',
      description:
        'Aqui ficam as informações da organização e as abas de consumo, e-mail e políticas de segurança. Mantenha estes dados atualizados.',
      side: 'bottom'
    },
    {
      id: 'companies-nav',
      route: '/app/settings/companies',
      element: '[data-tour="nav-companies"]',
      title: 'Empresas',
      description:
        'Em Configurações → Empresas você cadastra os CNPJs da organização. Cada empresa tem certificado, atividades e fluxos próprios.',
      side: 'right'
    },
    {
      id: 'companies-table',
      route: '/app/settings/companies',
      element: '[data-tour="companies-table"]',
      title: 'Lista de empresas',
      description:
        'Clique em uma empresa da tabela para abrir o detalhe. É lá que você envia o certificado A1 (.pfx) usado na emissão e consulta de notas.',
      side: 'top'
    }
  ];

  if (opts.certificateRoute) {
    steps.push({
      id: 'certificate',
      route: opts.certificateRoute,
      element: '[data-tour="company-certificate-tab"]',
      title: 'Certificado digital',
      description:
        'Na aba Certificado você faz o upload do A1, acompanha validade e histórico. Sem certificado ativo a emissão e várias consultas não funcionam.',
      side: 'right'
    });
  }

  if (opts.fiscalRoute) {
    steps.push(
      {
        id: 'fiscal-nav',
        route: opts.fiscalRoute,
        element: '[data-tour="nav-fiscal"]',
        title: 'Notas fiscais',
        description:
          'Os menus de NF-e e NFS-e (entrada e saída) dependem dos serviços contratados. Todos usam a mesma lógica de listagem, filtros e status.',
        side: 'right'
      },
      {
        id: 'fiscal-list',
        route: opts.fiscalRoute,
        element: '[data-tour="fiscal-list"]',
        title: 'Lista de documentos',
        description:
          'Aqui você acompanha documentos, filtra por status, consulta detalhes e executa ações (download, manifestação, exclusão, etc.).',
        side: 'top'
      }
    );
  }

  steps.push(
    {
      id: 'users-nav',
      route: '/app/settings/users',
      element: '[data-tour="nav-users"]',
      title: 'Usuários',
      description:
        'Em Usuários você convida pessoas, define status e atribui perfis de acesso à organização.',
      side: 'right'
    },
    {
      id: 'users-page',
      route: '/app/settings/users',
      element: '[data-tour="users-page"]',
      title: 'Gestão de membros',
      description:
        'Convide por e-mail, adicione membros existentes e gerencie papéis. Quem tem acesso e o que pode fazer começa aqui.',
      side: 'top'
    },
    {
      id: 'profiles-nav',
      route: '/app/settings/profiles',
      element: '[data-tour="nav-profiles"]',
      title: 'Perfis de acesso',
      description:
        'Perfis agrupam permissões (organização, empresas, documentos, etc.). Crie perfis e associe-os aos usuários.',
      side: 'right'
    },
    {
      id: 'profiles-page',
      route: '/app/settings/profiles',
      element: '[data-tour="profiles-page"]',
      title: 'Permissões por perfil',
      description:
        'Cada perfil define o que o membro pode ver e alterar. Ajuste com cuidado antes de atribuir a muita gente.',
      side: 'top'
    },
    {
      id: 'integrations-nav',
      route: '/app/settings/integrations',
      element: '[data-tour="nav-integrations"]',
      title: 'Integrações',
      description:
        'Em Integrações você conecta sistemas (como SAP), gerencia tokens de entrada e consulta logs das chamadas.',
      side: 'right'
    },
    {
      id: 'integrations-page',
      route: '/app/settings/integrations',
      element: '[data-tour="integrations-page"]',
      title: 'Sistemas, tokens e logs',
      description:
        'Use as abas para cadastrar credenciais do ERP, emitir tokens que o SAP usa para enviar documentos e auditar as requisições.',
      side: 'top'
    },
    {
      id: 'profile-page',
      route: '/app/profile',
      element: '[data-tour="profile-page"]',
      title: 'Seu perfil',
      description:
        'No Perfil (menu do usuário) você atualiza dados pessoais, aparência da interface, segurança (incluindo 2FA), atividade e notificações.',
      side: 'bottom'
    },
    {
      id: 'profile-appearance',
      route: '/app/profile?tab=appearance',
      element: '[data-tour="profile-appearance"]',
      title: 'Aparência',
      description:
        'Escolha tema claro/escuro, densidade, tamanho da fonte e cor de destaque. As preferências ficam salvas na sua conta.',
      side: 'left'
    },
    {
      id: 'profile-mfa',
      route: '/app/profile?tab=security',
      element: '[data-tour="profile-mfa"]',
      title: 'Segurança e MFA',
      description:
        'Aqui você troca senha, gerencia sessões e ativa a autenticação em dois fatores (2FA) com app autenticador — essencial se a organização exigir.',
      side: 'left'
    },
    {
      id: 'support-nav',
      route: '/app/support',
      element: '[data-tour="nav-support"]',
      title: 'Suporte',
      description:
        'No rodapé da barra lateral ficam Suporte e Ajuda. Use-os quando precisar de FAQ, abrir chamado ou ver status da plataforma.',
      side: 'right',
      align: 'end'
    },
    {
      id: 'support-page',
      route: '/app/support',
      element: '[data-tour="support-page"]',
      title: 'Pronto!',
      description:
        'Na área de suporte você consulta FAQ, abre tickets e acompanha o status. Para rever este tour: menu do usuário → “Ver tour novamente”.',
      side: 'top'
    }
  );

  return steps;
}
