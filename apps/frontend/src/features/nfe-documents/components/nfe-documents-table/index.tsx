'use client';

import { DataTable } from '@/components/ui/table/data-table';
import { DataTableToolbar } from '@/components/ui/table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';
import { nfeDocumentsListQueryOptions } from '../../api/queries';
import type { NfeDocumentDirection } from '../../api/types';
import { columns } from './columns';

const columnIds = columns.map((c) => c.id).filter(Boolean) as string[];

interface NfeDocumentsTableProps {
  organizationId: string;
}

export function NfeDocumentsTable({ organizationId }: NfeDocumentsTableProps) {
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(20),
    search: parseAsString,
    direction: parseAsStringEnum(['all', 'inbound', 'outbound']).withDefault('all'),
  });

  const filters = {
    page: params.page,
    perPage: params.perPage,
    ...(params.search && { search: params.search }),
    direction: params.direction as NfeDocumentDirection | 'all',
  };

  const { data } = useSuspenseQuery(
    nfeDocumentsListQueryOptions(organizationId, filters),
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

export function NfeDocumentsTableSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-4'>
      <div className='bg-muted h-10 w-full rounded' />
      <div className='bg-muted h-96 w-full rounded-lg' />
      <div className='bg-muted h-10 w-full rounded' />
    </div>
  );
}
