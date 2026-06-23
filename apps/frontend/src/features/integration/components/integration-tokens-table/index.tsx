'use client';

import { DataTable } from '@/components/ui/table/data-table';
import { DataTableToolbar } from '@/components/ui/table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { integrationTokensQueryOptions } from '../../api/queries';
import { columns } from './columns';

interface IntegrationTokensTableProps {
  organizationId: string;
}

export function IntegrationTokensTable({ organizationId }: IntegrationTokensTableProps) {
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(10),
    name: parseAsString,
  });

  const filters = {
    page: params.page,
    limit: params.perPage,
    ...(params.name && { search: params.name }),
  };

  const { data } = useSuspenseQuery(integrationTokensQueryOptions(organizationId, filters));

  const pageCount = Math.max(1, Math.ceil(data.total / params.perPage));

  const { table } = useDataTable({
    data: data.items,
    columns,
    pageCount,
    shallow: true,
    initialState: {
      columnPinning: { right: ['actions'] },
    },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}

export function IntegrationTokensTableSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-4'>
      <div className='bg-muted h-10 w-full rounded' />
      <div className='bg-muted h-96 w-full rounded-lg' />
      <div className='bg-muted h-10 w-full rounded' />
    </div>
  );
}
