'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { OrganizationMember } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { MemberCellAction } from './cell-action';

export const columns: ColumnDef<OrganizationMember>[] = [
  {
    id: 'nome',
    accessorFn: (row) => `${row.user.nome} ${row.user.sobrenome}`,
    header: ({ column }: { column: Column<OrganizationMember, unknown> }) => (
      <DataTableColumnHeader column={column} title='Usuário' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>
          {row.original.user.nome} {row.original.user.sobrenome}
        </span>
        <span className='text-muted-foreground text-xs'>{row.original.user.email}</span>
      </div>
    ),
    meta: {
      label: 'Usuário',
      placeholder: 'Buscar usuários...',
      variant: 'text' as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    id: 'role',
    accessorFn: (row) => row.role.nome,
    header: ({ column }: { column: Column<OrganizationMember, unknown> }) => (
      <DataTableColumnHeader column={column} title='Perfil' />
    ),
    cell: ({ row }) => (
      <Badge variant='outline' className='capitalize'>
        {row.original.role.nome}
      </Badge>
    ),
  },
  {
    accessorKey: 'userId',
    header: 'ID DO USUÁRIO',
    cell: ({ row }) => (
      <span className='text-muted-foreground font-mono text-xs'>{row.original.userId}</span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <MemberCellAction data={row.original} />,
  },
];
