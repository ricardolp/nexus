'use client';

import { DataTable } from '@/components/ui/table/data-table';
import { DataTableToolbar } from '@/components/ui/table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { nfeOrganizationEventsListQueryOptions } from '../../api/queries';
import { columns } from './columns';

interface NfeEventsTableProps {
  organizationId: string;
}

export function NfeEventsTable({ organizationId }: NfeEventsTableProps) {
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(20),
    search: parseAsString,
    eventType: parseAsString,
    eventStatus: parseAsString,
  });

  const filters = {
    page: params.page,
    perPage: params.perPage,
    ...(params.search && { search: params.search }),
    ...(params.eventType && { eventType: params.eventType }),
    ...(params.eventStatus && { eventStatus: params.eventStatus }),
  };

  const { data } = useSuspenseQuery(
    nfeOrganizationEventsListQueryOptions(organizationId, filters),
  );

  const pageCount = Math.max(1, Math.ceil(data.total / params.perPage));

  const { table } = useDataTable({
    data: data.items,
    columns,
    pageCount,
    shallow: true,
    initialState: {
      columnPinning: { right: ['actions'] },
      pagination: { pageIndex: params.page - 1, pageSize: params.perPage },
      columnVisibility: { search: false },
    },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}

export function NfeEventsTableSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-4'>
      <div className='bg-muted h-10 w-full rounded' />
      <div className='bg-muted h-96 w-full rounded-lg' />
      <div className='bg-muted h-10 w-full rounded' />
    </div>
  );
}
