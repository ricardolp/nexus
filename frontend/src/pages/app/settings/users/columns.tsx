import type { ColumnDef } from '@tanstack/react-table';
import {
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
  MailIcon,
  MoreHorizontalIcon,
  HistoryIcon,
  ShieldPlusIcon,
  Trash2Icon,
  KeyRoundIcon,
  XIcon
} from 'lucide-react';

import type { ApiMember, ApiMemberRole } from '@/lib/api-types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { isPendingMember } from './optimistic';

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

const roleLabels: Record<string, { label: string; className: string }> = {
  admin: { label: 'Administrador', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  system: { label: 'Sistema', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  support: { label: 'Suporte', className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  member: { label: 'Membro', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' }
};

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  invited: { label: 'Convidado', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  expired: { label: 'Convite expirado', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  suspended: { label: 'Bloqueado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' }
};

function isInviteExpired(member: ApiMember) {
  if (member.status !== 'invited' || !member.invitation_expires_at) return false;
  return new Date(member.invitation_expires_at).getTime() <= Date.now();
}

export function getMemberColumns(
  currentUserId: string | undefined,
  rolesByMember: Record<string, ApiMemberRole[]>,
  onToggleStatus: (member: ApiMember, status: 'active' | 'suspended') => void,
  onAddRole: (member: ApiMember) => void,
  onRemoveRole: (member: ApiMember, role: ApiMemberRole) => void,
  onSetPassword: (member: ApiMember) => void,
  onResendInvite: (member: ApiMember) => void,
  onHistory: (member: ApiMember) => void,
  onRemove: (member: ApiMember) => void
): ColumnDef<ApiMember>[] {
  return [
    {
      accessorKey: 'email',
      header: 'Usuário',
      cell: ({ row }) => {
        const pending = isPendingMember(row.original);
        return (
          <div className="flex items-center gap-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(row.original.email)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.email}</span>
            {pending && <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" />}
          </div>
        );
      }
    },
    {
      accessorKey: 'platform_role',
      header: 'Função',
      cell: ({ row }) => {
        const role = roleLabels[row.original.platform_role] ?? {
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
      id: 'roles',
      header: 'Perfil',
      cell: ({ row }) => {
        const member = row.original;
        if (isPendingMember(member)) return null;
        const roles = rolesByMember[member.id] ?? [];
        if (roles.length === 0) {
          return <span className="text-muted-foreground text-xs">Sem perfil</span>;
        }
        return (
          <div className="flex max-w-xs flex-wrap gap-1">
            {roles.map((role) => (
              <Badge
                key={role.id}
                variant="outline"
                className="gap-1 bg-indigo-500/10 pr-1 text-indigo-600 dark:text-indigo-400"
              >
                {role.role_name}
                <button
                  type="button"
                  className="hover:bg-indigo-500/20 rounded-full p-0.5"
                  onClick={() => onRemoveRole(member, role)}
                >
                  <XIcon className="size-3" />
                  <span className="sr-only">Remover perfil</span>
                </button>
              </Badge>
            ))}
          </div>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const statusKey = isInviteExpired(row.original) ? 'expired' : row.original.status;
        const status = statusLabels[statusKey] ?? {
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
      accessorKey: 'joined_at',
      header: 'Entrou em',
      cell: ({ row }) => formatDate(row.original.joined_at)
    },
    {
      accessorKey: 'last_login_at',
      header: 'Último login',
      cell: ({ row }) => formatDate(row.original.last_login_at)
    },
    {
      accessorKey: 'created_at',
      header: 'Criado em',
      cell: ({ row }) => formatDate(row.original.created_at)
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const member = row.original;
        const pending = isPendingMember(member);
        const isSelf = currentUserId === member.user_id;
        const canToggle = member.status === 'active' || member.status === 'suspended';

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-8 p-0" disabled={pending}>
                <span className="sr-only">Abrir menu</span>
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {member.status === 'invited' && (
                <DropdownMenuItem onClick={() => onResendInvite(member)}>
                  <MailIcon />
                  Reenviar convite
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onHistory(member)}>
                <HistoryIcon />
                Ver histórico
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddRole(member)}>
                <ShieldPlusIcon />
                Adicionar perfil
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isSelf} onClick={() => onSetPassword(member)}>
                <KeyRoundIcon />
                Definir senha
              </DropdownMenuItem>
              {member.status === 'active' ? (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canToggle || isSelf}
                  onClick={() => onToggleStatus(member, 'suspended')}
                >
                  <LockIcon />
                  Bloquear
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled={!canToggle} onClick={() => onToggleStatus(member, 'active')}>
                  <LockOpenIcon />
                  Desbloquear
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={isSelf} onClick={() => onRemove(member)}>
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
