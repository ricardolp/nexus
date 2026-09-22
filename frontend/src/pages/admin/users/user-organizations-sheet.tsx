import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiUser } from '@/lib/api-types';
import {
  addSupportMember,
  listOrganizations,
  listSupportMembers,
  listUserOrganizations,
  removeSupportMember
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

interface UserOrganizationsSheetProps {
  user: ApiUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserOrganizationsSheet({ user, open, onOpenChange }: UserOrganizationsSheetProps) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const orgsQuery = useQuery({
    queryKey: ['user-organizations', user?.id],
    queryFn: () => listUserOrganizations(token!, user!.id),
    enabled: !!token && !!user && open
  });

  const allOrgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token && open
  });

  const linked = orgsQuery.data?.items ?? [];
  const linkedIds = useMemo(() => new Set(linked.map((o) => o.id)), [linked]);
  const available = useMemo(
    () => (allOrgsQuery.data?.items ?? []).filter((o) => o.status === 'active' && !linkedIds.has(o.id)),
    [allOrgsQuery.data?.items, linkedIds]
  );

  const addMutation = useMutation({
    mutationFn: (organizationId: string) =>
      addSupportMember(token!, organizationId, { user_id: user!.id }),
    onSuccess: (_member, organizationId) => {
      toast.success('Organização vinculada');
      setSelectedOrgId('');
      queryClient.invalidateQueries({ queryKey: ['user-organizations', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-support-members', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível vincular a organização.');
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const members = await listSupportMembers(token!, organizationId);
      const member = members.items.find((m) => m.user_id === user!.id);
      if (!member) {
        throw new ApiError({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          code: 'member_not_found',
          detail: 'Vínculo não encontrado nesta organização.',
          trace_id: ''
        });
      }
      await removeSupportMember(token!, organizationId, member.id);
      return organizationId;
    },
    onSuccess: (organizationId) => {
      toast.success('Vínculo removido');
      queryClient.invalidateQueries({ queryKey: ['user-organizations', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-support-members', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover o vínculo.');
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelectedOrgId('');
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Organizações vinculadas</SheetTitle>
          <SheetDescription>
            {user
              ? `Defina em quais tenants ${user.email} pode entrar para setup e suporte.`
              : 'Vínculos de suporte'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecionar organização" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.trade_name || org.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedOrgId || addMutation.isPending}
              onClick={() => selectedOrgId && addMutation.mutate(selectedOrgId)}
            >
              <PlusIcon />
              Vincular
            </Button>
          </div>

          {orgsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : orgsQuery.isError ? (
            <p className="text-destructive text-sm">
              {orgsQuery.error instanceof ApiError
                ? orgsQuery.error.message
                : 'Não foi possível carregar as organizações.'}
            </p>
          ) : linked.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma organização vinculada.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linked.map((org) => (
                <li
                  key={org.id}
                  className="bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <Building2Icon className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{org.trade_name || org.legal_name}</div>
                    <div className="text-muted-foreground truncate text-xs">{org.slug}</div>
                  </div>
                  <Badge variant="outline">{org.status}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(org.id)}
                  >
                    <Trash2Icon />
                    <span className="sr-only">Remover</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
