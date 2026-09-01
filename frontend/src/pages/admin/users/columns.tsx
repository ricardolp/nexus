import type { ColumnDef } from '@tanstack/react-table';
import { CheckIcon, CopyIcon, HistoryIcon, KeyRoundIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import type { ApiUser } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const roleVariant: Record<string, { label: string; className: string }> = {
  admin: { label: 'Administrador', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  system: { label: 'Sistema', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  support: { label: 'Suporte', className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  member: { label: 'Membro', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' }
};

const statusVariant: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  pending: { label: 'Convite pendente', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  suspended: { label: 'Suspenso', className: 'bg-red-500/10 text-red-600 dark:text-red-400' }
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

export function getUserColumns(
  currentUserId: string | undefined,
  onSetPassword: (user: ApiUser) => void,
  onHistory: (user: ApiUser) => void,
  onDelete: (user: ApiUser) => void
): ColumnDef<ApiUser>[] {
  return [
    {
      accessorKey: 'email',
      header: 'E-mail',
      cell: ({ row }) => <span className="font-medium">{row.original.email}</span>
    },
    {
      accessorKey: 'platform_role',
      header: 'Função',
      cell: ({ row }) => {
        const role = roleVariant[row.original.platform_role] ?? {
          label: row.original.platform_role,
          className: ''
        };
        return (
          <Badge variant="outline" className={role.className}>
            {role.label}
          </Badge>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = statusVariant[row.original.status] ?? { label: row.original.status, className: '' };
        return (
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        );
      }
    },
    {
      accessorKey: 'last_login_at',
      header: 'Último login',
      cell: ({ row }) => (row.original.last_login_at ? formatDate(row.original.last_login_at) : '—')
    },
    {
      accessorKey: 'created_at',
      header: 'Criado em',
      cell: ({ row }) => formatDate(row.original.created_at)
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const user = row.original;
        const isSelf = currentUserId === user.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontalIcon />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(user.id);
                  toast.success('ID copiado', { icon: <CheckIcon className="size-4" /> });
                }}
              >
                <CopyIcon />
                Copiar ID
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onHistory(user)}>
                <HistoryIcon />
                Ver histórico
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isSelf} onClick={() => onSetPassword(user)}>
                <KeyRoundIcon />
                Definir senha
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={isSelf} onClick={() => onDelete(user)}>
                <Trash2Icon />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    }
  ];
}
