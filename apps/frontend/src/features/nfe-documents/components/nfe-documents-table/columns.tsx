'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { NfeDocumentListItem } from '../../api/types';
import {
  DOCUMENT_STATUS_LABELS,
  FLUXO_BADGE_CLASS,
  INBOUND_BADGE_CLASS,
  INBOUND_STATUS_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_INTERNO_LABELS,
} from '../../constants/nfe-status-options';
import { formatCurrency, formatCnpj, formatDateTime } from '../../lib/format';
import { nfeDocumentDetailPath } from '../../lib/paths';
import { CellAction } from './cell-action';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';

export const columns: ColumnDef<NfeDocumentListItem>[] = [
  {
    id: 'direction',
    accessorKey: 'direction',
    header: 'Fluxo',
    cell: ({ row }) => {
      const isOutbound = row.original.direction === 'outbound';
      return (
        <div className='flex items-center gap-1.5 whitespace-nowrap'>
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded',
              isOutbound ? FLUXO_BADGE_CLASS.outbound : FLUXO_BADGE_CLASS.inbound,
            )}
          >
            {isOutbound ? (
              <IconArrowUp className='size-3.5' />
            ) : (
              <IconArrowDown className='size-3.5' />
            )}
          </span>
          <span className='text-sm capitalize'>
            {isOutbound ? 'Outbound' : 'Inbound'}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Número' />
    ),
    cell: ({ row }) => (
      <Link
        href={nfeDocumentDetailPath(row.original.id)}
        className='font-mono text-sm tabular-nums text-primary hover:underline'
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.number}
      </Link>
    ),
  },
  {
    accessorKey: 'series',
    header: 'Série',
    cell: ({ row }) => (
      <span className='tabular-nums'>{row.original.series}</span>
    ),
  },
  {
    accessorKey: 'model',
    header: 'Modelo',
  },
  {
    accessorKey: 'issuedAt',
    header: 'Emissão',
    cell: ({ row }) => formatDateTime(row.original.issuedAt),
  },
  {
    id: 'party',
    header: 'Emitente / Destinatário',
    cell: ({ row }) => (
      <div className='max-w-[200px] truncate text-sm'>
        {row.original.recipientName ?? row.original.issuerCnpj}
      </div>
    ),
  },
  {
    accessorKey: 'issuerCnpj',
    header: 'CNPJ',
    cell: ({ row }) => (
      <span className='font-mono text-xs'>
        {formatCnpj(row.original.recipientDocument ?? row.original.issuerCnpj)}
      </span>
    ),
  },
  {
    accessorKey: 'totalAmount',
    header: 'Valor total',
    cell: ({ row }) => formatCurrency(row.original.totalAmount),
  },
  {
    accessorKey: 'status',
    header: 'Status SEFAZ',
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <Badge
          variant='outline'
          className={cn('border-0', STATUS_BADGE_CLASS[status] ?? '')}
        >
          {DOCUMENT_STATUS_LABELS[status] ?? status}
        </Badge>
      );
    },
  },
  {
    id: 'inboundStatus',
    header: 'Integração',
    cell: ({ row }) => {
      if (row.original.direction !== 'inbound') {
        return <span className='text-muted-foreground text-xs'>—</span>;
      }
      const interno = row.original.statusInterno;
      const inbound = row.original.inboundStatus;
      if (!inbound) return <span className='text-muted-foreground text-xs'>—</span>;
      return (
        <Badge
          variant='outline'
          className={cn(
            'border-0',
            interno ? INBOUND_BADGE_CLASS[interno] : '',
          )}
        >
          {INBOUND_STATUS_LABELS[inbound] ??
            (interno ? STATUS_INTERNO_LABELS[interno] : inbound)}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'updatedAt',
    header: 'Atualização',
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
  {
    id: 'search',
    accessorKey: 'accessKey',
    header: () => null,
    cell: () => null,
    enableHiding: false,
    meta: {
      label: 'Buscar',
      placeholder: 'Chave, número, CNPJ...',
      variant: 'text' as const,
    },
    enableColumnFilter: true,
  },
  {
    id: 'actions',
    header: 'Ações',
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
