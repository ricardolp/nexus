import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, MailPlusIcon, PlusIcon, SearchIcon, UserPlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  addOrganizationMember,
  assignMemberRole,
  inviteUser,
  listMemberRoles,
  listMembers,
  listRoles,
  removeMemberRole,
  removeOrganizationMember,
  resendMemberInvitation,
  setMemberPassword,
  updateMemberStatus
} from '@/lib/endpoints';
import type { ApiMember, ApiMemberRole } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { AddMemberDialog, type AddMemberFormValues } from './add-member-dialog';
import { AssignRoleDialog, type AssignRoleFormValues } from './assign-role-dialog';
import { getMemberColumns } from './columns';
import { InviteMemberDialog, type InviteMemberFormValues } from './invite-member-dialog';
import { isPendingMember, OPTIMISTIC_ID_PREFIX } from './optimistic';
import { RemoveMemberDialog } from './remove-member-dialog';
import { SetPasswordDialog } from '@/components/auth/set-password-dialog';
import { UserHistorySheet } from '@/components/user-history-sheet';

type MembersResponse = { items: ApiMember[] };

export default function OrganizationUsersPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const membersQueryKey = ['members', organizationId];

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignRoleMember, setAssignRoleMember] = useState<ApiMember | null>(null);
  const [passwordMember, setPasswordMember] = useState<ApiMember | null>(null);
  const [historyMember, setHistoryMember] = useState<ApiMember | null>(null);
  const [removingMember, setRemovingMember] = useState<ApiMember | null>(null);

  const enabled = !!token && !!organizationId;

  const membersQuery = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => listMembers(token!, organizationId!),
    enabled
  });

  const members = membersQuery.data?.items ?? [];

  const rolesQuery = useQuery({
    queryKey: ['roles', organizationId],
    queryFn: () => listRoles(token!, organizationId!),
    enabled
  });
  const allRoles = rolesQuery.data?.items ?? [];

  const memberRoleQueries = useQueries({
    queries: members
      .filter((m) => !isPendingMember(m))
      .map((member) => ({
        queryKey: ['member-roles', organizationId, member.id],
        queryFn: () => listMemberRoles(token!, organizationId!, member.id),
        enabled
      }))
  });

  const rolesByMember = useMemo(() => {
    const map: Record<string, ApiMemberRole[]> = {};
    const nonPending = members.filter((m) => !isPendingMember(m));
    nonPending.forEach((member, index) => {
      map[member.id] = memberRoleQueries[index]?.data?.items ?? [];
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, memberRoleQueries]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: membersQueryKey });

  function insertOptimistic(email: string, status: ApiMember['status']) {
    const previous = queryClient.getQueryData<MembersResponse>(membersQueryKey);
    const now = new Date().toISOString();
    const optimisticMember: ApiMember = {
      id: `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`,
      user_id: `${OPTIMISTIC_ID_PREFIX}user`,
      email,
      platform_role: 'member',
      status,
      joined_at: status === 'active' ? now : null,
      created_at: now
    };
    queryClient.setQueryData<MembersResponse>(membersQueryKey, (old) => ({
      items: [optimisticMember, ...(old?.items ?? [])]
    }));
    return previous;
  }

  const addMutation = useMutation({
    mutationFn: (values: AddMemberFormValues) => addOrganizationMember(token!, organizationId!, values.email),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: membersQueryKey });
      return { previous: insertOptimistic(values.email, 'active') };
    },
    onSuccess: (member) => {
      toast.success('Usuário adicionado', { description: member.email });
      invalidate();
    },
    onError: (err: unknown, _values, context) => {
      if (context?.previous) queryClient.setQueryData(membersQueryKey, context.previous);
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar o usuário.');
    }
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteMemberFormValues) => inviteUser(token!, values.email, 'member', organizationId!),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: membersQueryKey });
      return { previous: insertOptimistic(values.email, 'invited') };
    },
    onSuccess: (invitation) => {
      toast.success('Convite enviado', {
        description: `${invitation.email} ainda não terá nenhum perfil de acesso até que você atribua um.`
      });
      invalidate();
    },
    onError: (err: unknown, _values, context) => {
      if (context?.previous) queryClient.setQueryData(membersQueryKey, context.previous);
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível enviar o convite.');
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ member, status }: { member: ApiMember; status: 'active' | 'suspended' }) =>
      updateMemberStatus(token!, organizationId!, member.id, status),
    onSuccess: (member) => {
      toast.success(member.status === 'suspended' ? 'Usuário bloqueado' : 'Usuário desbloqueado', {
        description: member.email
      });
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    }
  });

  const assignRoleMutation = useMutation({
    mutationFn: (values: AssignRoleFormValues) =>
      assignMemberRole(token!, organizationId!, assignRoleMember!.id, values.role_id),
    onSuccess: (memberRole) => {
      toast.success('Perfil adicionado', { description: memberRole.role_name });
      queryClient.invalidateQueries({ queryKey: ['member-roles', organizationId, assignRoleMember?.id] });
      setAssignRoleMember(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar o perfil.');
    }
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ member, role }: { member: ApiMember; role: ApiMemberRole }) =>
      removeMemberRole(token!, organizationId!, member.id, role.organization_role_id),
    onSuccess: (_data, { member, role }) => {
      toast.success('Perfil removido', { description: role.role_name });
      queryClient.invalidateQueries({ queryKey: ['member-roles', organizationId, member.id] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover o perfil.');
    }
  });

  const passwordMutation = useMutation({
    mutationFn: ({ member, password }: { member: ApiMember; password: string }) =>
      setMemberPassword(token!, organizationId!, member.id, password),
    onSuccess: (_void, { member }) => {
      toast.success('Senha definida', { description: member.email });
      setPasswordMember(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível definir a senha.');
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: (member: ApiMember) => removeOrganizationMember(token!, organizationId!, member.id),
    onSuccess: (_data, member) => {
      toast.success('Usuário eliminado', { description: member.email });
      setRemovingMember(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível eliminar o usuário.');
    }
  });

  const resendInviteMutation = useMutation({
    mutationFn: (member: ApiMember) => resendMemberInvitation(token!, organizationId!, member.id),
    onSuccess: (invitation) => {
      toast.success('Convite reenviado', {
        description: `Um novo e-mail foi enviado para ${invitation.email}. O link expira em 48 horas.`
      });
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível reenviar o convite.');
    }
  });

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((m) => isPendingMember(m) || m.email.toLowerCase().includes(query));
  }, [members, search]);

  const columns = useMemo(
    () =>
      getMemberColumns(
        currentUserId,
        rolesByMember,
        (member, status) => statusMutation.mutate({ member, status }),
        (member) => setAssignRoleMember(member),
        (member, role) => removeRoleMutation.mutate({ member, role }),
        (member) => setPasswordMember(member),
        (member) => resendInviteMutation.mutate(member),
        (member) => setHistoryMember(member),
        (member) => setRemovingMember(member)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, rolesByMember]
  );

  const assignedRoleIds = new Set(
    (assignRoleMember ? rolesByMember[assignRoleMember.id] : [])?.map((r) => r.organization_role_id)
  );
  const availableRolesForAssign = allRoles.filter((r) => !assignedRoleIds.has(r.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-5" />
            Usuários
          </CardTitle>
          <CardDescription>Gerencie os membros da sua organização.</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={!enabled}>
              <PlusIcon />
              Adicionar
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAddOpen(true)}>
              <UserPlusIcon />
              Adicionar usuário
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setInviteOpen(true)}>
              <MailPlusIcon />
              Convidar usuário
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {!organizationId ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma organização associada à sua conta no momento.
          </p>
        ) : membersQuery.isLoading ? (
          <DataTableSkeleton columnCount={8} />
        ) : membersQuery.isError ? (
          <p className="text-destructive text-sm">
            {membersQuery.error instanceof ApiError
              ? membersQuery.error.message
              : 'Não foi possível carregar os usuários.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={filteredMembers}
            getRowClassName={(member) => (isPendingMember(member) ? 'animate-pulse opacity-60' : undefined)}
            toolbar={() => (
              <div className="relative w-full max-w-sm">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Buscar por e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
          />
        )}
      </CardContent>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        submitting={addMutation.isPending}
        onSubmit={async (values) => {
          setAddOpen(false);
          await addMutation.mutateAsync(values);
        }}
      />

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        submitting={inviteMutation.isPending}
        onSubmit={async (values) => {
          setInviteOpen(false);
          await inviteMutation.mutateAsync(values);
        }}
      />

      <AssignRoleDialog
        open={!!assignRoleMember}
        onOpenChange={(open) => !open && setAssignRoleMember(null)}
        member={assignRoleMember}
        availableRoles={availableRolesForAssign}
        submitting={assignRoleMutation.isPending}
        onSubmit={async (values) => {
          await assignRoleMutation.mutateAsync(values);
        }}
      />

      <SetPasswordDialog
        open={!!passwordMember}
        email={passwordMember?.email ?? null}
        pending={passwordMutation.isPending}
        onOpenChange={(open) => !open && setPasswordMember(null)}
        onSubmit={(password) => passwordMember && passwordMutation.mutate({ member: passwordMember, password })}
      />

      <UserHistorySheet
        token={token!}
        target={
          historyMember && organizationId
            ? {
                kind: 'member',
                organizationId,
                memberId: historyMember.id,
                email: historyMember.email,
                lastLoginAt: historyMember.last_login_at
              }
            : null
        }
        open={!!historyMember}
        onOpenChange={(open) => !open && setHistoryMember(null)}
      />

      <RemoveMemberDialog
        member={removingMember}
        pending={removeMemberMutation.isPending}
        onOpenChange={(open) => !open && setRemovingMember(null)}
        onConfirm={() => removingMember && removeMemberMutation.mutate(removingMember)}
      />
    </Card>
  );
}
