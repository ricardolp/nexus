import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheckIcon } from 'lucide-react';

import type { ApiPendingFiscalDocument } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCNPJ, formatCurrency, formatDateTime } from './format';
import { badgeFor, pendingDocumentStatusLabels } from './status-labels';

export function getPendingDocumentColumns(
  onManifest: (document: ApiPendingFiscalDocument) => void
): ColumnDef<ApiPendingFiscalDocument>[] {
  return [
    {
      id: 'emitente',
      header: 'Emitente',
      cell: ({ row }) => {
        const { nome_emitente, cnpj_emitente } = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-primary font-medium">{nome_emitente || '—'}</span>
            {cnpj_emitente && (
              <span className="text-muted-foreground text-xs">{formatCNPJ(cnpj_emitente)}</span>
            )}
          </div>
        );
      }
    },
    {
      id: 'chave',
      header: 'Chave de acesso',
      cell: ({ row }) => (
        <span className="font-mono text-xs" title={row.original.chave}>
          {row.original.chave}
        </span>
      )
    },
    {
      id: 'valor',
      header: 'Valor',
      cell: ({ row }) => formatCurrency(row.original.valor)
    },
    {
      id: 'data_emissao',
      header: 'Emissão',
      cell: ({ row }) => formatDateTime(row.original.data_emissao)
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = badgeFor(pendingDocumentStatusLabels, row.original.status);
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className={cn('w-fit gap-1.5 font-normal', status.className)}>
              <span className={cn('size-1.5 rounded-full', status.dot)} />
              {status.label}
            </Badge>
            {row.original.status === 'error' && row.original.error_message && (
              <span className="text-muted-foreground max-w-64 text-xs" title={row.original.error_message}>
                {row.original.error_message}
              </span>
            )}
          </div>
        );
      }
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const doc = row.original;
        if (doc.status !== 'pending' && doc.status !== 'error') return null;
        return (
          <div data-no-row-click>
            <Button variant="outline" size="sm" onClick={() => onManifest(doc)}>
              <BadgeCheckIcon />
              {doc.status === 'error' ? 'Tentar novamente' : 'Dar Ciência'}
            </Button>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false
    }
  ];
}
