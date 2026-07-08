'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OrganizationUsageList } from '../api/types';

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description?: string;
}) {
  return (
    <Card className='shadow-sm'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold tabular-nums'>{value}</div>
        {description ? (
          <p className='text-muted-foreground mt-1 text-xs'>{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function UsageSummaryCards({ data }: { data: OrganizationUsageList }) {
  const { totals } = data;

  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      <SummaryCard
        title='Notas emitidas'
        value={totals.emittedTotal}
        description={`NFe: ${totals.nfeEmitted} · NFSe: ${totals.nfseEmitted}`}
      />
      <SummaryCard title='Documentos' value={totals.documentsTotal} />
      <SummaryCard title='Eventos' value={totals.eventsTotal} />
      <SummaryCard
        title='Organizações'
        value={totals.organizations}
        description={`${totals.companies} empresas · ${totals.members} membros`}
      />
    </div>
  );
}
