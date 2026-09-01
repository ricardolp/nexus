import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  createRole,
  deleteRole,
  listPermissionCatalog,
  listRoles,
  updateRole,
  type RoleInput
} from '@/lib/endpoints';
import type { ApiRole } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getRoleColumns } from './columns';
import { isPendingRole, OPTIMISTIC_ID_PREFIX } from './optimistic';
import { RoleFormDialog } from './role-form-dialog';

type RolesResponse = { items: ApiRole[] };

export default function AccessProfilesPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const rolesQueryKey = ['roles', organizationId];

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ApiRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<ApiRole | null>(null);

  const enabled = !!token && !!organizationId;

  const rolesQuery = useQuery({
    queryKey: rolesQueryKey,
    queryFn: () => listRoles(token!, organizationId!),
    enabled
  });

  const permissionsQuery = useQuery({
    queryKey: ['permission-catalog', organizationId],
    queryFn: () => listPermissionCatalog(token!, organizationId!),
    enabled
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: rolesQueryKey });

  const createMutation = useMutation({
    mutationFn: (input: RoleInput) => createRole(token!, organizationId!, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: rolesQueryKey });
      const previous = queryClient.getQueryData<RolesResponse>(rolesQueryKey);
      const now = new Date().toISOString();
      const optimisticRole: ApiRole = {
        id: `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`,
        organization_id: organizationId!,
        name: input.name,
        slug: input.name.trim().toLowerCase().split(/\s+/).join('_'),
        description: input.description || null,
        is_system: false,
        is_default: false,
        status: 'active',
        created_at: now,
        updated_at: now,
        permissions: input.permissions
      };
      queryClient.setQueryData<RolesResponse>(rolesQueryKey, (old) => ({
        items: [optimisticRole, ...(old?.items ?? [])]
      }));
      return { previous };
    },
    onSuccess: (role) => {
      toast.success('Perfil de acesso criado', { description: role.name });
      setFormOpen(false);
      invalidate();
    },
    onError: (err: unknown, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(rolesQueryKey, context.previous);
      }
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar o perfil.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (input: RoleInput) => updateRole(token!, organizationId!, editingRole!.id, input),
    onSuccess: (role) => {
      toast.success('Perfil de acesso atualizado', { description: role.name });
      setFormOpen(false);
      setEditingRole(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o perfil.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (role: ApiRole) => deleteRole(token!, organizationId!, role.id),
    onSuccess: () => {
      toast.success('Perfil de acesso excluído');
      setDeletingRole(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir o perfil.');
    }
  });

  const roles = rolesQuery.data?.items ?? [];
  const permissionCatalog = permissionsQuery.data?.items ?? [];

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roles;
    return roles.filter(
      (r) => isPendingRole(r) || r.name.toLowerCase().includes(query) || r.slug.toLowerCase().includes(query)
    );
  }, [roles, search]);

  function openCreate() {
    setEditingRole(null);
    setFormOpen(true);
  }

  function openEdit(role: ApiRole) {
    setEditingRole(role);
    setFormOpen(true);
  }

  const columns = useMemo(() => getRoleColumns(openEdit, setDeletingRole), []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5" />
            Perfis de acesso
          </CardTitle>
          <CardDescription>
            Defina quais ações cada perfil pode executar dentro da organização.
          </CardDescription>
        </div>
        <Button onClick={openCreate} disabled={!enabled}>
          <PlusIcon />
          Novo perfil
        </Button>
      </CardHeader>
      <CardContent>
        {!organizationId ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma organização associada à sua conta no momento.
          </p>
        ) : rolesQuery.isLoading ? (
          <DataTableSkeleton columnCount={6} />
        ) : rolesQuery.isError ? (
          <p className="text-destructive text-sm">
            {rolesQuery.error instanceof ApiError
              ? rolesQuery.error.message
              : 'Não foi possível carregar os perfis de acesso.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRoles}
            getRowClassName={(role) => (isPendingRole(role) ? 'animate-pulse opacity-60' : undefined)}
            toolbar={() => (
              <div className="relative w-full max-w-sm">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Buscar por nome ou slug..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
          />
        )}
      </CardContent>

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editingRole}
        permissionCatalog={permissionCatalog}
        submitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={async (values) => {
          if (editingRole) {
            await updateMutation.mutateAsync(values);
          } else {
            setFormOpen(false);
            await createMutation.mutateAsync(values);
          }
        }}
      />

      <Dialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir perfil de acesso?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. O perfil "{deletingRole?.name}" será removido
              permanentemente. Perfis ainda atribuídos a membros não podem ser excluídos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingRole(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingRole && deleteMutation.mutate(deletingRole)}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
