import type { ColumnDef } from '@tanstack/react-table';

import type { ApiFiscalDocumentQuery } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateTime } from './format';
import { badgeFor, fiscalQueryStatusLabels, fiscalQueryTypeLabels } from './status-labels';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function queryTargetLabel(query: ApiFiscalDocumentQuery): string {
  const params = asRecord(query.params_json);
  if (!params) return '—';
  if (query.query_type === 'nsu') {
    const nsu = params.nsu;
    return typeof nsu === 'number' || typeof nsu === 'string' ? `NSU ${nsu}` : '—';
  }
  const chaves = Array.isArray(params.chaves) ? params.chaves.filter((c): c is string => typeof c === 'string') : [];
  if (chaves.length === 0) return '—';
  if (chaves.length === 1) return chaves[0];
  return `${chaves[0]} +${chaves.length - 1}`;
}

export function getFiscalQueryColumns(): ColumnDef<ApiFiscalDocumentQuery>[] {
  return [
    {
      id: 'type',
      header: 'Tipo',
      cell: ({ row }) => fiscalQueryTypeLabels[row.original.query_type] ?? row.original.query_type
    },
    {
      id: 'target',
      header: 'Chave / NSU',
      cell: ({ row }) => {
        const label = queryTargetLabel(row.original);
        return (
          <span className="font-mono text-xs" title={label}>
            {label}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = badgeFor(fiscalQueryStatusLabels, row.original.status);
        return (
          <Badge variant="outline" className={cn('w-fit gap-1.5 font-normal', status.className)}>
            <span className={cn('size-1.5 rounded-full', status.dot)} />
            {status.label}
          </Badge>
        );
      }
    },
    {
      id: 'created_at',
      header: 'Solicitada em',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatDateTime(row.original.created_at)}</span>
      )
    },
    {
      id: 'completed_at',
      header: 'Concluída em',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatDateTime(row.original.completed_at)}</span>
      )
    }
  ];
}
