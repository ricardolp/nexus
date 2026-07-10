'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { NfeOrganizationEvent } from '../../api/types';
import {
  EVENT_STATUS_BADGE_CLASS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  FLUXO_BADGE_CLASS,
} from '../../constants/nfe-status-options';
import { formatDateTime } from '../../lib/format';
import { nfeDocumentDetailPath, nfeEventDetailPath } from '../../lib/paths';
import { CellAction } from './cell-action';

export const columns: ColumnDef<NfeOrganizationEvent>[] = [
  {
    accessorKey: 'eventType',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Tipo' />
    ),
    cell: ({ row }) => (
      <Link
        href={nfeEventDetailPath(row.original.id)}
        className='text-sm font-medium text-primary hover:underline'
        onClick={(e) => e.stopPropagation()}
      >
        {EVENT_TYPE_LABELS[row.original.eventType] ?? row.original.eventType}
      </Link>
    ),
  },
  {
    accessorKey: 'eventStatus',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        variant='outline'
        className={cn(
          'border-0 capitalize',
          EVENT_STATUS_BADGE_CLASS[row.original.eventStatus],
        )}
      >
        {EVENT_STATUS_LABELS[row.original.eventStatus] ??
          row.original.eventStatus}
      </Badge>
    ),
  },
  {
    id: 'document',
    header: 'NF-e',
    cell: ({ row }) => {
      const doc = row.original.document;
      return (
        <div className='flex flex-col gap-0.5'>
          <Link
            href={nfeDocumentDetailPath(doc.id)}
            className='font-mono text-sm tabular-nums text-primary hover:underline'
            onClick={(e) => e.stopPropagation()}
          >
            {doc.number}
          </Link>
          <span className='text-muted-foreground text-xs'>
            Série {doc.series}
          </span>
        </div>
      );
    },
  },
  {
    id: 'direction',
    header: 'Fluxo',
    cell: ({ row }) => {
      const direction = row.original.document.direction;
      return (
        <Badge
          variant='outline'
          className={cn(
            'border-0 capitalize',
            direction === 'inbound'
              ? FLUXO_BADGE_CLASS.inbound
              : FLUXO_BADGE_CLASS.outbound,
          )}
        >
          {direction}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'sequence',
    header: 'Seq.',
    cell: ({ row }) => (
      <span className='tabular-nums'>{row.original.sequence}</span>
    ),
  },
  {
    accessorKey: 'protocol',
    header: 'Protocolo',
    cell: ({ row }) =>
      row.original.protocol ? (
        <span className='font-mono text-xs'>{row.original.protocol}</span>
      ) : (
        <span className='text-muted-foreground'>—</span>
      ),
  },
  {
    id: 'search',
    accessorFn: (row) =>
      [
        row.eventType,
        row.protocol,
        row.document.number,
        row.document.accessKey,
        row.sefazStatusMessage,
      ]
        .filter(Boolean)
        .join(' '),
    header: 'Busca',
    enableHiding: true,
    enableColumnFilter: true,
    meta: {
      label: 'Busca',
      placeholder: 'Tipo, protocolo, número, chave...',
      variant: 'text',
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Data' />
    ),
    cell: ({ row }) =>
      formatDateTime(row.original.completedAt ?? row.original.createdAt),
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
