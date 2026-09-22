import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';

import type { ApiCustomer } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function formatPartnerDoc(c: ApiCustomer) {
  if (c.cnpj) {
    const digits = c.cnpj.replace(/\D/g, '');
    if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return c.cnpj;
  }
  if (c.cpf) {
    const digits = c.cpf.replace(/\D/g, '');
    if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return c.cpf;
  }
  return c.nif ?? '—';
}

export function getPartnerColumns(onEdit: (customer: ApiCustomer) => void): ColumnDef<ApiCustomer>[] {
  return [
    {
      accessorKey: 'legal_name',
      header: 'Parceiro',
      cell: ({ row }) => <span className="font-medium">{row.original.legal_name}</span>
    },
    {
      id: 'document',
      header: 'Documento',
      cell: ({ row }) => <span className="font-mono text-sm">{formatPartnerDoc(row.original)}</span>
    },
    {
      accessorKey: 'email',
      header: 'E-mail',
      cell: ({ row }) => row.original.email || <span className="text-muted-foreground">—</span>
    },
    {
      accessorKey: 'uf',
      header: 'UF',
      cell: ({ row }) =>
        row.original.uf ? (
          <Badge variant="outline">{row.original.uf}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={row.original.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : ''}>
          {row.original.status === 'active' ? 'Ativo' : 'Arquivado'}
        </Badge>
      )
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div data-no-row-click>
          <Button variant="outline" size="sm" onClick={() => onEdit(row.original)}>
            <PencilIcon />
            Editar
          </Button>
        </div>
      )
    }
  ];
}
