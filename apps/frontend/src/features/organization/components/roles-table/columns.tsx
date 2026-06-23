'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { OrganizationRole } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { RoleCellAction } from './cell-action';

export const columns: ColumnDef<OrganizationRole>[] = [
  {
    id: 'nome',
    accessorKey: 'nome',
    header: ({ column }: { column: Column<OrganizationRole, unknown> }) => (
      <DataTableColumnHeader column={column} title='Perfil' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>{row.original.nome}</span>
        <span className='text-muted-foreground text-xs'>{row.original.slug}</span>
      </div>
    ),
    meta: {
      label: 'Perfil',
      placeholder: 'Buscar perfis...',
      variant: 'text' as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'slug',
    header: 'SLUG',
    cell: ({ row }) => <span className='font-mono text-sm'>{row.original.slug}</span>,
  },
  {
    id: 'permissions',
    accessorFn: (row) => row.permissions.length,
    header: 'PERMISSÕES',
    cell: ({ row }) => (
      <div className='flex flex-wrap gap-1'>
        <Badge variant='secondary'>{row.original.permissions.length} permissões</Badge>
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <RoleCellAction data={row.original} />,
  },
];
