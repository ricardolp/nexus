'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { organizationUsageQueryOptions } from '../api/queries';
import type { Organization, OrganizationUsageFilters } from '../api/types';
import {
  labelDocumentDirection,
  labelDocumentStatus,
  labelEventType,
  labelIntegrationOperation,
  labelNfeModel,
  sortByCountDesc,
} from '../lib/usage-labels';

interface OrganizationUsageSheetProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UsageRowProps = {
  label: string;
  count: number;
};

function UsageRow({ label, count }: UsageRowProps) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className='text-right font-mono tabular-nums'>{count}</TableCell>
    </TableRow>
  );
}

function UsageTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className='space-y-2'>
      <h4 className='text-sm font-medium'>{title}</h4>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className='text-right'>Quantidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <UsageRow key={row.label} label={row.label} count={row.count} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, description }: { title: string; value: number; description?: string }) {
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

function toRows(
  map: Record<string, number>,
  labelFn: (key: string) => string,
): { label: string; count: number }[] {
  return sortByCountDesc(Object.entries(map)).map(([key, count]) => ({
    label: labelFn(key),
    count,
  }));
}

export function OrganizationUsageSheet({
  organization,
  open,
  onOpenChange,
}: OrganizationUsageSheetProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<OrganizationUsageFilters>({});

  const usageQuery = useQuery({
    ...organizationUsageQueryOptions(organization.id, appliedFilters),
    enabled: open,
  });

  const usage = usageQuery.data;

  const emittedTotal = useMemo(() => {
    if (!usage) return 0;
    return usage.documents.nfe.emitted + usage.documents.nfse.emitted;
  }, [usage]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>Indicadores de uso</SheetTitle>
          <SheetDescription>
            Métricas de consumo de <strong>{organization.nome}</strong> para apoio à precificação.
          </SheetDescription>
        </SheetHeader>

        <div className='space-y-4 border-b pb-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='usage-from'>De</Label>
              <Input
                id='usage-from'
                type='date'
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='usage-to'>Até</Label>
              <Input
                id='usage-to'
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

        <div className='flex-1 space-y-6 overflow-auto py-4'>
          {usageQuery.isLoading ? (
            <div className='flex items-center justify-center py-12'>
              <Spinner className='h-6 w-6' />
            </div>
          ) : usageQuery.isError ? (
            <p className='text-destructive text-sm'>
              {usageQuery.error.message || 'Falha ao carregar indicadores'}
            </p>
          ) : usage ? (
            <>
              <div className='grid gap-3 sm:grid-cols-2'>
                <SummaryCard
                  title='Notas emitidas (autorizadas)'
                  value={emittedTotal}
                  description={`NFe: ${usage.documents.nfe.emitted} · NFSe: ${usage.documents.nfse.emitted}`}
                />
                <SummaryCard title='Total de documentos' value={usage.documents.total} />
                <SummaryCard title='Total de eventos' value={usage.events.total} />
                <SummaryCard
                  title='Recursos cadastrados'
                  value={usage.resources.companies}
                  description={`${usage.resources.members} membros · ${usage.resources.certificates} certificados`}
                />
              </div>

              <div className='space-y-4'>
                <h3 className='text-base font-semibold'>Documentos NFe</h3>
                <UsageTable
                  title='Por modelo'
                  rows={toRows(usage.documents.nfe.byModel, labelNfeModel)}
                />
                <UsageTable
                  title='Por direção'
                  rows={toRows(usage.documents.nfe.byDirection, labelDocumentDirection)}
                />
                <UsageTable
                  title='Por status'
                  rows={toRows(usage.documents.nfe.byStatus, labelDocumentStatus)}
                />
              </div>

              <div className='space-y-4'>
                <h3 className='text-base font-semibold'>Documentos NFSe</h3>
                <UsageTable
                  title='Por direção'
                  rows={toRows(usage.documents.nfse.byDirection, labelDocumentDirection)}
                />
                <UsageTable
                  title='Por status'
                  rows={toRows(usage.documents.nfse.byStatus, labelDocumentStatus)}
                />
              </div>

              <div className='space-y-4'>
                <h3 className='text-base font-semibold'>Eventos</h3>
                <UsageTable
                  title='Eventos NFe por tipo'
                  rows={toRows(usage.events.nfe.byType, labelEventType)}
                />
                <UsageTable
                  title='Eventos NFSe por tipo'
                  rows={toRows(usage.events.nfse.byType, labelEventType)}
                />
              </div>

              <div className='space-y-4'>
                <h3 className='text-base font-semibold'>Integração</h3>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <SummaryCard
                    title='Chamadas de integração'
                    value={usage.integration.requestLogs}
                  />
                  <SummaryCard
                    title='Entregas de webhook'
                    value={usage.integration.webhookDeliveries}
                  />
                </div>
                <UsageTable
                  title='Integração por operação'
                  rows={toRows(usage.integration.byOperation, labelIntegrationOperation)}
                />
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
