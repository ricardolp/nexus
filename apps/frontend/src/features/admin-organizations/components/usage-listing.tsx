'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Icons } from '@/components/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { organizationsUsageQueryOptions } from '../api/queries';
import type { OrganizationUsageFilters } from '../api/types';
import { UsageSummaryCards } from './usage-summary-cards';
import { UsageTable } from './usage-table';

export default function UsageListingPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<OrganizationUsageFilters>({});

  const usageQuery = useQuery(organizationsUsageQueryOptions(appliedFilters));

  const applyPeriod = () => {
    setAppliedFilters({
      from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
    });
  };

  const clearPeriod = () => {
    setFrom('');
    setTo('');
    setAppliedFilters({});
  };

  return (
    <div className='space-y-6'>
      <div className='space-y-4 rounded-lg border p-4'>
        <div>
          <h3 className='text-sm font-medium'>Período de análise</h3>
          <p className='text-muted-foreground text-sm'>
            Filtre por data de criação dos documentos e eventos para precificar um intervalo
            específico.
          </p>
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:max-w-xl'>
          <div className='space-y-1.5'>
            <Label htmlFor='usage-list-from'>De</Label>
            <Input
              id='usage-list-from'
              type='date'
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='usage-list-to'>Até</Label>
            <Input
              id='usage-list-to'
              type='date'
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <div className='flex gap-2'>
          <Button type='button' size='sm' onClick={applyPeriod}>
            <Icons.search className='mr-2 h-4 w-4' />
            Filtrar período
          </Button>
          <Button type='button' size='sm' variant='outline' onClick={clearPeriod}>
            Limpar
          </Button>
        </div>
      </div>

      {usageQuery.isLoading ? (
        <div className='flex items-center justify-center py-16'>
          <Spinner className='h-6 w-6' />
        </div>
      ) : usageQuery.isError ? (
        <p className='text-destructive text-sm'>
          {usageQuery.error.message || 'Falha ao carregar indicadores'}
        </p>
      ) : usageQuery.data ? (
        <>
          <UsageSummaryCards data={usageQuery.data} />
          <UsageTable items={usageQuery.data.items} />
        </>
      ) : null}
    </div>
  );
}
