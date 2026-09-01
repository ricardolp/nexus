import type { ColumnDef } from '@tanstack/react-table';
import { DownloadIcon, MoreHorizontalIcon, PlugZapIcon, Trash2Icon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatCNPJ, formatDateTime } from './format';
import { badgeFor, processingStatusLabels, statusLabels } from './status-labels';

export function getFiscalDocumentColumns(
  onViewIntegration: (document: ApiFiscalDocument) => void,
  onDownload: (document: ApiFiscalDocument) => void,
  onDelete: (document: ApiFiscalDocument) => void
): ColumnDef<ApiFiscalDocument>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <div data-no-row-click>
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Selecionar todas"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div data-no-row-click>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Selecionar linha"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 32
    },
    {
      id: 'document',
      header: 'Emitente',
      cell: ({ row }) => {
        const { document_key, issuer_cnpj, issuer_name, external_id, source_system } = row.original;
        const primary = issuer_name || document_key || external_id || (issuer_cnpj ? formatCNPJ(issuer_cnpj) : null);
        return (
          <div className="flex flex-col">
            <span className="text-primary font-medium">{primary || '—'}</span>
            <span className="text-muted-foreground text-xs">{source_system}</span>
          </div>
        );
      }
    },
    {
      id: 'number',
      header: 'Número / Série',
      cell: ({ row }) => {
        const { number, series } = row.original;
        if (!number && !series) return <span className="text-muted-foreground">—</span>;
        return (
          <span>
            {number || '—'}
            {series ? <span className="text-muted-foreground"> / {series}</span> : null}
          </span>
        );
      }
    },
    {
      id: 'access_key',
      header: 'Chave de acesso',
      cell: ({ row }) => {
        const key = row.original.access_key;
        if (!key) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="font-mono text-xs" title={key}>
            {key}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = badgeFor(statusLabels, row.original.status);
        return (
          <Badge variant="outline" className={cn('gap-1.5 font-normal', status.className)}>
            <span className={cn('size-1.5 rounded-full', status.dot)} />
            {status.label}
          </Badge>
        );
      }
    },
    {
      accessorKey: 'processing_status',
      header: 'Processamento',
      cell: ({ row }) => {
        const status = badgeFor(processingStatusLabels, row.original.processing_status);
        return (
          <Badge variant="outline" className={cn('gap-1.5 font-normal', status.className)}>
            <span className={cn('size-1.5 rounded-full', status.dot)} />
            {status.label}
          </Badge>
        );
      }
    },
    {
      accessorKey: 'environment',
      header: 'Ambiente',
      cell: ({ row }) => (
        <span className="capitalize">
          {row.original.environment === 'production' ? 'Produção' : 'Homologação'}
        </span>
      )
    },
    {
      accessorKey: 'received_at',
      header: 'Recebido em',
      cell: ({ row }) => formatDateTime(row.original.received_at)
    },
    {
      accessorKey: 'completed_at',
      header: 'Concluído em',
      cell: ({ row }) => formatDateTime(row.original.completed_at)
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const doc = row.original;
        return (
          <div data-no-row-click>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="size-8 p-0">
                  <span className="sr-only">Abrir menu</span>
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewIntegration(doc)}>
                  <PlugZapIcon />
                  Ver integração
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(doc)}>
                  <DownloadIcon />
                  Baixar XML
                </DropdownMenuItem>
                {doc.source_system === 'manual_upload' && (
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(doc)}>
                    <Trash2Icon />
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      }
    }
  ];
}
