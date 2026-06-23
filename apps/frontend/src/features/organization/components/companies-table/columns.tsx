'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { OrganizationCompany } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CompanyCellAction } from './cell-action';

const statusLabels: Record<OrganizationCompany['status'], string> = {
  active: 'Ativa',
  inactive: 'Inativa',
};

export const columns: ColumnDef<OrganizationCompany>[] = [
  {
    id: 'razaoSocial',
    accessorKey: 'razaoSocial',
    header: ({ column }: { column: Column<OrganizationCompany, unknown> }) => (
      <DataTableColumnHeader column={column} title='Razão social' />
    ),
    cell: ({ row }) => <span className='font-medium'>{row.original.razaoSocial}</span>,
    meta: {
      label: 'Razão social',
      placeholder: 'Buscar empresas...',
      variant: 'text' as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'cnpj',
    header: 'CNPJ',
    cell: ({ row }) => <span className='font-mono text-sm'>{row.original.cnpj}</span>,
  },
  {
    accessorKey: 'status',
    header: 'STATUS',
    cell: ({ row }) => {
      const status = row.original.status;
      const variant = status === 'active' ? 'default' : 'secondary';
      return <Badge variant={variant}>{statusLabels[status]}</Badge>;
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <CompanyCellAction data={row.original} />,
  },
];
