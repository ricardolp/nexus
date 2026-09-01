export type FaqCategory = 'geral' | 'nfe' | 'conta' | 'seguranca' | 'integracoes';

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    id: 'faq-1',
    category: 'conta',
    question: 'Onde fica meu perfil?',
    answer:
      'No rodapé da barra lateral, clique no seu nome ou e-mail e escolha Perfil. Lá você altera dados, aparência, senha e 2FA.'
  },
  {
    id: 'faq-org',
    category: 'conta',
    question: 'Onde vejo os dados da organização?',
    answer:
      'No rodapé da barra lateral, clique no seu nome e escolha Organização. A aba Geral mostra identidade e padrões; Segurança reúne senha, 2FA, sessões e bloqueio. Só administradores da organização podem editar.'
  },
  {
    id: 'faq-2',
    category: 'nfe',
    question: 'Por que uma nota não tem XML?',
    answer:
      'Notas encontradas só pelo resumo da SEFAZ precisam de Ciência da Operação. Depois da Ciência, o XML completo entra na lista de entrada.'
  },
  {
    id: 'faq-3',
    category: 'nfe',
    question: 'Como funciona a Ciência da Operação?',
    answer:
      'Quando a SEFAZ envia só o resumo da nota, ela aparece como aguardando Ciência. Confirme a Ciência para a plataforma baixar o XML completo e seguir o processamento.'
  },
  {
    id: 'faq-4',
    category: 'nfe',
    question: 'A NF-e de saída já emite nota?',
    answer: 'Ainda não. A tela de saída está preparada, mas a emissão não está disponível nesta versão.'
  },
  {
    id: 'faq-5',
    category: 'geral',
    question: 'O que aparece na Visão Geral?',
    answer:
      'Pendências do dia: notificações não lidas, notas de entrada, Ciência da Operação e itens que precisam de ação. Os gráficos mostram quantidade de notas, sem valores financeiros.'
  },
  {
    id: 'faq-6',
    category: 'nfe',
    question: 'Como filtro as NF-e de entrada?',
    answer:
      'Em NF-e Entrada ficam os XMLs recebidos. Use os filtros para ver o que está em andamento, concluído ou com problema. Clique numa nota para abrir o detalhe e o fluxo de integração.'
  },
  {
    id: 'faq-7',
    category: 'conta',
    question: 'Como funcionam as notificações?',
    answer:
      'O sino no topo avisa quando uma consulta à SEFAZ termina ou quando há algo a tratar. Na Visão Geral, as não lidas ficam em evidência.'
  },
  {
    id: 'faq-8',
    category: 'integracoes',
    question: 'Quem pode alterar empresas, usuários e fluxos?',
    answer:
      'Empresas, usuários, perfis de acesso e integrações ficam em Configurações. Certificado, serviços e fluxos de processo ficam dentro de cada empresa. Só quem tem permissão vê e altera esses itens.'
  },
  {
    id: 'faq-9',
    category: 'seguranca',
    question: 'Como ativo a autenticação em dois fatores?',
    answer:
      'Abra Perfil, vá em Segurança e ative o 2FA com um app autenticador. Algumas organizações exigem 2FA no primeiro acesso.'
  },
  {
    id: 'faq-10',
    category: 'geral',
    question: 'Como altero o tema claro ou escuro?',
    answer:
      'Use o botão de tema na barra superior, a paleta de comandos (Ctrl/⌘ K) ou a aba Aparência no Perfil. A preferência é salva na sua conta.'
  }
];

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export const TICKET_SLA_HOURS: Record<TicketPriority, number> = {
  low: 120,
  medium: 48,
  high: 8,
  critical: 1
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'SLA muito alto'
};

export interface TicketFiscalRef {
  number: string;
  documentId: string;
  documentType: 'nfe' | 'nfse' | string;
}

export type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

export function allowedTicketPriorities(isProduction: boolean): TicketPriority[] {
  return isProduction ? ['low', 'medium', 'high', 'critical'] : ['medium'];
}
