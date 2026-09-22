import type { ColumnDef } from '@tanstack/react-table';
import { EyeIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ApiMaterial } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function materialPath(id: string) {
  return `/app/master-data/materials/${id}`;
}

export function getMaterialColumns(): ColumnDef<ApiMaterial>[] {
  return [
    {
      accessorKey: 'material_code',
      header: 'Material',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono font-medium">{row.original.material_code}</span>
          {row.original.supplier_material_code &&
            row.original.supplier_material_code !== row.original.material_code && (
              <span className="text-muted-foreground text-xs">Forn. {row.original.supplier_material_code}</span>
            )}
        </div>
      )
    },
    {
      accessorKey: 'description',
      header: 'Descrição',
      cell: ({ row }) => row.original.description || <span className="text-muted-foreground">—</span>
    },
    {
      accessorKey: 'base_unit',
      header: 'UMB',
      cell: ({ row }) =>
        row.original.base_unit ? (
          <Badge variant="outline" className="font-mono">
            {row.original.base_unit}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
    },
    {
      id: 'uoms',
      header: 'Unidades alt.',
      cell: ({ row }) => {
        const count = row.original.uoms?.length ?? 0;
        return count > 0 ? `${count}` : <span className="text-muted-foreground">0</span>;
      }
    },
    {
      accessorKey: 'ncm',
      header: 'NCM',
      cell: ({ row }) =>
        row.original.ncm ? <span className="font-mono text-sm">{row.original.ncm}</span> : <span className="text-muted-foreground">—</span>
    },
    {
      accessorKey: 'source',
      header: 'Origem',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.source === 'manual' ? 'Manual' : 'XML / nota'}</Badge>
      )
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div data-no-row-click>
          <Button variant="outline" size="sm" asChild>
            <Link to={materialPath(row.original.id)}>
              <EyeIcon />
              Unidades
            </Link>
          </Button>
        </div>
      )
    }
  ];
}
