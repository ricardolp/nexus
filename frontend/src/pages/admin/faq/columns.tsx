import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontalIcon, PencilIcon, PowerIcon } from 'lucide-react';

import type { ApiFaqMessage } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const severityVariant: Record<string, string> = {
  DENIED: 'bg-red-500/10 text-red-600 dark:text-red-400',
  REJECTED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  TECHNICAL: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  UNKNOWN: 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
};

export function getFaqColumns(
  onEdit: (msg: ApiFaqMessage) => void,
  onToggleActive: (msg: ApiFaqMessage) => void
): ColumnDef<ApiFaqMessage>[] {
  return [
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => <Badge variant="outline">{row.original.source}</Badge>
    },
    {
      accessorKey: 'code',
      header: 'Código',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>
    },
    {
      accessorKey: 'docsta',
      header: 'Docsta',
      cell: ({ row }) => row.original.docsta || '—'
    },
    {
      accessorKey: 'severity',
      header: 'Severidade',
      cell: ({ row }) => (
        <Badge variant="outline" className={severityVariant[row.original.severity] ?? ''}>
          {row.original.severity}
        </Badge>
      )
    },
    {
      accessorKey: 'title',
      header: 'Título',
      cell: ({ row }) => (
        <div className="max-w-md">
          <div className="font-medium truncate">{row.original.title}</div>
          <div className="text-muted-foreground text-xs truncate">{row.original.summary}</div>
        </div>
      )
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) =>
        row.original.active ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Ativo
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400">
            Inativo
          </Badge>
        )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Ações</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              <PencilIcon className="size-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(row.original)}>
              <PowerIcon className="size-4" />
              {row.original.active ? 'Desativar' : 'Ativar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
}
