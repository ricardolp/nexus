'use client';

import { DataTable } from '@/components/ui/table/data-table';
import { useDataTable } from '@/hooks/use-data-table';
import type { OrganizationUsageSummaryItem } from '../../api/types';
import { columns } from './columns';

interface UsageTableProps {
  items: OrganizationUsageSummaryItem[];
}

export function UsageTable({ items }: UsageTableProps) {
  const { table } = useDataTable({
    data: items,
    columns,
    pageCount: 1,
    shallow: false,
    initialState: {
      columnPinning: { right: ['actions'] },
      pagination: { pageSize: 20 },
    },
  });

  return <DataTable table={table} />;
}
