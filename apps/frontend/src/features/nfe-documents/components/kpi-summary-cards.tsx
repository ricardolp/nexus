'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuspenseQuery } from '@tanstack/react-query';
import { nfeDocumentsSummaryQueryOptions } from '../api/queries';
import { formatCurrency } from '../lib/format';
import type { NfeDocumentsSummary } from '../api/types';
import { IconArrowDown, IconArrowUp, IconAlertTriangle, IconCheck, IconClock, IconReceipt } from '@tabler/icons-react';

type KpiCardProps = {
  title: string;
  count: number;
  amount: string;
  icon: React.ReactNode;
  accent?: string;
};

function KpiCard({ title, count, amount, icon, accent }: KpiCardProps) {
  return (
    <Card className='shadow-sm'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>{title}</CardTitle>
        <div className={accent ?? 'text-muted-foreground'}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold tabular-nums'>{count}</div>
        <p className='text-muted-foreground text-xs'>{formatCurrency(amount)}</p>
      </CardContent>
    </Card>
  );
}

function buildCards(summary: NfeDocumentsSummary): KpiCardProps[] {
  return [
    {
      title: 'Total no período',
      count: summary.total.count,
      amount: summary.total.amount,
      icon: <IconReceipt className='size-4' />,
    },
    {
      title: 'Inbound',
      count: summary.inbound.count,
      amount: summary.inbound.amount,
      icon: <IconArrowDown className='size-4' />,
      accent: 'text-violet-600',
    },
    {
      title: 'Outbound',
      count: summary.outbound.count,
      amount: summary.outbound.amount,
      icon: <IconArrowUp className='size-4' />,
      accent: 'text-blue-600',
    },
    {
      title: 'Faturadas',
      count: summary.faturadas.count,
      amount: summary.faturadas.amount,
      icon: <IconCheck className='size-4' />,
      accent: 'text-emerald-600',
    },
    {
      title: 'Pendentes',
      count: summary.pendentes.count,
      amount: summary.pendentes.amount,
      icon: <IconClock className='size-4' />,
      accent: 'text-amber-600',
    },
    {
      title: 'Alertas / Erros',
      count: summary.alertasErros.count,
      amount: summary.alertasErros.amount,
      icon: <IconAlertTriangle className='size-4' />,
      accent: 'text-red-600',
    },
  ];
}

export function KpiSummaryCards({ organizationId }: { organizationId: string }) {
  const { data } = useSuspenseQuery(nfeDocumentsSummaryQueryOptions(organizationId));
  const cards = buildCards(data);

  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6'>
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}

export function KpiSummaryCardsSkeleton() {
  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6'>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className='bg-muted h-28 animate-pulse rounded-xl' />
      ))}
    </div>
  );
}
