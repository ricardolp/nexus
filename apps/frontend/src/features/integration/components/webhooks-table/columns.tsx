'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import type { WebhookEndpoint } from '../../api/types';
import { formatDateTime } from '../../lib/format';
import { WebhookCellAction } from './cell-action';

export const columns: ColumnDef<WebhookEndpoint>[] = [
  {
    id: 'url',
    accessorKey: 'url',
    header: ({ column }) => <DataTableColumnHeader column={column} title='URL' />,
    cell: ({ row }) => (
      <span className='max-w-[320px] truncate font-mono text-sm' title={row.original.url}>
        {row.original.url}
      </span>
    ),
    meta: {
      label: 'URL',
      placeholder: 'Buscar webhooks...',
      variant: 'text' as const,
      icon: Icons.text,
    },
    enableColumnFilter: true,
  },
  {
    accessorKey: 'description',
    header: 'Descrição',
    cell: ({ row }) => row.original.description || '—',
  },
  {
    id: 'eventTypes',
    header: 'Eventos',
    cell: ({ row }) => (
      <Badge variant='secondary'>{row.original.eventTypes.length} eventos</Badge>
    ),
  },
  {
    accessorKey: 'active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.active ? 'default' : 'secondary'}>
        {row.original.active ? 'Ativo' : 'Inativo'}
      </Badge>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Criado em',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    id: 'actions',
    cell: ({ row }) => <WebhookCellAction data={row.original} />,
  },
];
