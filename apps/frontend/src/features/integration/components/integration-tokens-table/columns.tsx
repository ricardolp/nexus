'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import type { IntegrationToken } from '../../api/types';
import { formatDateTime, getTokenStatus, TOKEN_STATUS_LABELS } from '../../lib/format';
import { TokenCellAction } from './cell-action';

export const columns: ColumnDef<IntegrationToken>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Nome' />,
    cell: ({ row }) => <span className='font-medium'>{row.original.name}</span>,
    meta: {
      label: 'Nome',
      placeholder: 'Buscar tokens...',
      variant: 'text' as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'tokenPrefix',
    header: 'Prefixo',
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.tokenPrefix}…</span>
    ),
  },
  {
    id: 'scopes',
    header: 'Escopos',
    cell: ({ row }) => (
      <Badge variant='secondary'>{row.original.scopes.length} escopos</Badge>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = getTokenStatus(row.original);
      const variant =
        status === 'active' ? 'default' : status === 'expired' ? 'outline' : 'secondary';
      return <Badge variant={variant}>{TOKEN_STATUS_LABELS[status]}</Badge>;
    },
  },
  {
    accessorKey: 'lastUsedAt',
    header: 'Último uso',
    cell: ({ row }) => formatDateTime(row.original.lastUsedAt),
  },
  {
    accessorKey: 'expiresAt',
    header: 'Expira em',
    cell: ({ row }) => formatDateTime(row.original.expiresAt),
  },
  {
    accessorKey: 'createdAt',
    header: 'Criado em',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    id: 'actions',
    cell: ({ row }) => <TokenCellAction data={row.original} />,
  },
];
