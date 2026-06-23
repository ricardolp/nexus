'use client';

import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { Organization } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';

export const columns: ColumnDef<Organization>[] = [
  {
    id: 'nome',
    accessorKey: 'nome',
    header: ({ column }: { column: Column<Organization, unknown> }) => (
      <DataTableColumnHeader column={column} title='Organização' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>{row.original.nome}</span>
        <span className='text-muted-foreground text-xs'>{row.original.slug}</span>
      </div>
    ),
    meta: {
      label: 'Organização',
      placeholder: 'Buscar organizações...',
      variant: 'text' as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'slug',
    header: 'SLUG',
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.slug}</span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
