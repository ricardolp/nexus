import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiUser } from '@/lib/api-types';
import { deletePlatformUser, inviteUser, listPlatformUsers, setPlatformUserPassword } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getUserColumns } from './columns';
import { DeleteUserDialog } from './delete-user-dialog';
import { UserFormSheet, type InviteFormValues } from './user-form-sheet';
import { SetPasswordDialog } from '@/components/auth/set-password-dialog';
import { UserHistorySheet, type UserHistoryTarget } from '@/components/user-history-sheet';

export default function UsersPage() {
  const token = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<ApiUser | null>(null);
  const [historyUser, setHistoryUser] = useState<ApiUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ApiUser | null>(null);

  const {
    data,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => listPlatformUsers(token!),
    enabled: !!token
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteFormValues) => inviteUser(token!, values.email, values.platform_role),
    onSuccess: (_invitation, values) => {
      toast.success('Convite enviado', { description: values.email });
      setSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível enviar o convite.');
    }
  });

  const passwordMutation = useMutation({
    mutationFn: ({ user, password }: { user: ApiUser; password: string }) =>
      setPlatformUserPassword(token!, user.id, password),
    onSuccess: (_void, { user }) => {
      toast.success('Senha definida', { description: user.email });
      setPasswordUser(null);
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível definir a senha.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (user: ApiUser) => deletePlatformUser(token!, user.id),
    onSuccess: (_void, user) => {
      toast.success('Usuário eliminado', { description: user.email });
      setDeletingUser(null);
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível eliminar o usuário.');
    }
  });

  const users = data?.items ?? [];

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(query) || u.platform_role.toLowerCase().includes(query)
    );
  }, [users, search]);

  const columns = useMemo(
    () =>
      getUserColumns(
        currentUserId,
        (user) => setPasswordUser(user),
        (user) => setHistoryUser(user),
        (user) => setDeletingUser(user)
      ),
    [currentUserId]
  );

  const historyTarget: UserHistoryTarget | null = historyUser
    ? { kind: 'platform', userId: historyUser.id, email: historyUser.email, lastLoginAt: historyUser.last_login_at }
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Usuários da plataforma</CardTitle>
          <CardDescription>
            Equipe interna com acesso ao painel administrativo (admin, sistema e suporte) — dados reais
            da API.
          </CardDescription>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <PlusIcon />
          Convidar usuário
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <DataTableSkeleton columnCount={6} />
        ) : isError ? (
          <p className="text-destructive text-sm">
            {error instanceof ApiError ? error.message : 'Não foi possível carregar os usuários.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={filteredUsers}
            toolbar={() => (
              <div className="relative w-full max-w-sm">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Buscar por e-mail ou função..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
          />
        )}
      </CardContent>

      <UserFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        submitting={inviteMutation.isPending}
        onSubmit={async (values) => {
          await inviteMutation.mutateAsync(values);
        }}
      />

      <SetPasswordDialog
        open={!!passwordUser}
        email={passwordUser?.email ?? null}
        pending={passwordMutation.isPending}
        onOpenChange={(open) => !open && setPasswordUser(null)}
        onSubmit={(password) => passwordUser && passwordMutation.mutate({ user: passwordUser, password })}
      />

      <UserHistorySheet
        token={token!}
        target={historyTarget}
        open={!!historyUser}
        onOpenChange={(open) => !open && setHistoryUser(null)}
      />

      <DeleteUserDialog
        user={deletingUser}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => !open && setDeletingUser(null)}
        onConfirm={() => deletingUser && deleteMutation.mutate(deletingUser)}
      />
    </Card>
  );
}
