'use client';

import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { OrganizationUsageSummaryItem } from '../../api/types';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { UsageCellAction } from './cell-action';

export const columns: ColumnDef<OrganizationUsageSummaryItem>[] = [
  {
    id: 'nome',
    accessorKey: 'nome',
    header: ({ column }: { column: Column<OrganizationUsageSummaryItem, unknown> }) => (
      <DataTableColumnHeader column={column} title='Organização' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>{row.original.nome}</span>
        <span className='text-muted-foreground text-xs'>{row.original.slug}</span>
      </div>
    ),
  },
  {
    accessorKey: 'emittedTotal',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Emitidas' />,
    cell: ({ row }) => (
      <div className='tabular-nums'>
        <span className='font-medium'>{row.original.emittedTotal}</span>
        <span className='text-muted-foreground ml-2 text-xs'>
          NFe {row.original.nfeEmitted} · NFSe {row.original.nfseEmitted}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'documentsTotal',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Documentos' />,
    cell: ({ row }) => <span className='tabular-nums'>{row.original.documentsTotal}</span>,
  },
  {
    accessorKey: 'eventsTotal',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Eventos' />,
    cell: ({ row }) => <span className='tabular-nums'>{row.original.eventsTotal}</span>,
  },
  {
    accessorKey: 'companies',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Empresas' />,
    cell: ({ row }) => <span className='tabular-nums'>{row.original.companies}</span>,
  },
  {
    accessorKey: 'members',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Membros' />,
    cell: ({ row }) => <span className='tabular-nums'>{row.original.members}</span>,
  },
  {
    accessorKey: 'integrationRequests',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Integração' />,
    cell: ({ row }) => <span className='tabular-nums'>{row.original.integrationRequests}</span>,
  },
  {
    id: 'actions',
    cell: ({ row }) => <UsageCellAction data={row.original} />,
  },
];
