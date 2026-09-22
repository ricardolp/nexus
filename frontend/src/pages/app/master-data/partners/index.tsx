import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandshakeIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { listCustomers } from '@/lib/endpoints';
import type { ApiCustomer } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getPartnerColumns } from './columns';
import { CustomerFormDialog } from './customer-form-dialog';

export default function MasterDataPartnersPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCustomer | null>(null);

  const enabled = !!token && !!organizationId;
  const queryKey = ['customers', organizationId, search, 'saved'];

  const customersQuery = useQuery({
    queryKey,
    queryFn: () => listCustomers(token!, organizationId!, search, { includeHistory: false }),
    enabled
  });

  const items = customersQuery.data?.items ?? [];
  const columns = useMemo(
    () =>
      getPartnerColumns((customer) => {
        setEditing(customer);
        setDialogOpen(true);
      }),
    []
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HandshakeIcon className="size-5" />
            Parceiros
          </CardTitle>
          <CardDescription>
            Tomadores e demais parceiros da organização, os mesmos usados na emissão de NFS-e.
          </CardDescription>
        </div>
        <Button
          disabled={!enabled}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon />
          Novo parceiro
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="Busque por nome, e-mail, CPF ou CNPJ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!organizationId ? (
          <p className="text-muted-foreground text-sm">Nenhuma organização associada à sua conta no momento.</p>
        ) : customersQuery.isLoading ? (
          <DataTableSkeleton columnCount={6} />
        ) : customersQuery.isError ? (
          <p className="text-destructive text-sm">
            {customersQuery.error instanceof ApiError
              ? customersQuery.error.message
              : 'Não foi possível carregar os parceiros.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            showSelectionCount={false}
            onRowClick={(customer) => {
              setEditing(customer);
              setDialogOpen(true);
            }}
          />
        )}
      </CardContent>

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        customer={editing}
        submitLabel="Salvar"
        onSaved={() => {
          void customersQuery.refetch();
        }}
      />
    </Card>
  );
}
