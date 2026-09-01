import type { ColumnDef } from '@tanstack/react-table';
import { Loader2Icon, MoreHorizontalIcon } from 'lucide-react';

import type { ApiRole } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { isPendingRole } from './optimistic';
import { permissionLabel } from './permission-catalog';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

export function getRoleColumns(
  onEdit: (role: ApiRole) => void,
  onDelete: (role: ApiRole) => void
): ColumnDef<ApiRole>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Nome',
      cell: ({ row }) => {
        const pending = isPendingRole(row.original);
        return (
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="font-medium">{row.original.name}</span>
              <span className="text-muted-foreground text-xs">
                {pending ? 'salvando...' : row.original.slug}
              </span>
            </div>
            {pending && <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" />}
          </div>
        );
      }
    },
    {
      accessorKey: 'description',
      header: 'Descrição',
      cell: ({ row }) => (
        <span className="text-muted-foreground line-clamp-1 max-w-xs">
          {row.original.description || '—'}
        </span>
      )
    },
    {
      accessorKey: 'permissions',
      header: 'Permissões',
      cell: ({ row }) => {
        const permissions = row.original.permissions;
        return (
          <div className="flex max-w-xs flex-wrap gap-1">
            {permissions.slice(0, 3).map((permission) => (
              <Badge
                key={permission}
                variant="outline"
                className="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              >
                {permissionLabel(permission)}
              </Badge>
            ))}
            {permissions.length > 3 && (
              <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400">
                +{permissions.length - 3}
              </Badge>
            )}
          </div>
        );
      }
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: ({ row }) =>
        row.original.is_system ? (
          <Badge variant="outline" className="bg-violet-500/10 text-violet-600 dark:text-violet-400">
            Sistema
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Personalizado
          </Badge>
        )
    },
    {
      accessorKey: 'created_at',
      header: 'Criado em',
      cell: ({ row }) => formatDate(row.original.created_at)
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const pending = isPendingRole(row.original);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-8 p-0" disabled={pending}>
                <span className="sr-only">Abrir menu</span>
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(row.original)} disabled={row.original.is_system}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={row.original.is_system}
                onClick={() => onDelete(row.original)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    }
  ];
}
