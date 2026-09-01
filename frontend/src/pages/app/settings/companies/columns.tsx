import type { ColumnDef } from '@tanstack/react-table';
import { EyeIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ApiCompany } from '@/lib/api-types';
import { formatUF } from '@/lib/brazilian-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { companyPath } from './paths';

export function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

export const companyStatusLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  disabled: { label: 'Desativada', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  suspended: { label: 'Suspensa', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
};

export const companyEnvironmentLabels: Record<string, string> = {
  production: 'Produção',
  homologation: 'Homologação'
};

export function getCompanyColumns(): ColumnDef<ApiCompany>[] {
  return [
    {
      accessorKey: 'legal_name',
      header: 'Empresa',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.legal_name}</span>
          {row.original.trade_name && (
            <span className="text-muted-foreground text-xs">{row.original.trade_name}</span>
          )}
        </div>
      )
    },
    {
      accessorKey: 'cnpj',
      header: 'CNPJ',
      cell: ({ row }) => formatCNPJ(row.original.cnpj)
    },
    {
      accessorKey: 'uf',
      header: 'UF',
      cell: ({ row }) =>
        row.original.uf ? (
          <Badge variant="outline" title={formatUF(row.original.uf)}>
            {row.original.uf}
          </Badge>
        ) : (
          <span
            className="text-muted-foreground text-xs"
            title="Sem UF cadastrada — distribuição automática indisponível"
          >
            Não definida
          </span>
        )
    },
    {
      accessorKey: 'environment',
      header: 'Ambiente',
      cell: ({ row }) => (
        <Badge variant="outline">
          {companyEnvironmentLabels[row.original.environment] ?? row.original.environment}
        </Badge>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = companyStatusLabels[row.original.status] ?? {
          label: row.original.status,
          className: ''
        };
        return (
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        );
      }
    },
    {
      accessorKey: 'created_at',
      header: 'Criada em',
      cell: ({ row }) => formatDate(row.original.created_at)
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div data-no-row-click>
          <Button variant="outline" size="sm" asChild>
            <Link to={companyPath(row.original.id)}>
              <EyeIcon />
              Visualizar
            </Link>
          </Button>
        </div>
      )
    }
  ];
}
