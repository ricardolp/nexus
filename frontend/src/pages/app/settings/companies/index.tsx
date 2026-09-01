import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BuildingIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { createCompany, listCompanies, type CreateCompanyInput } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCompanyColumns } from './columns';
import { CompanyFormDialog } from './company-form-dialog';
import { companyPath } from './paths';

export default function CompaniesPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const queryKey = ['companies', organizationId];

  const [creating, setCreating] = useState(false);

  const enabled = !!token && !!organizationId;

  const companiesQuery = useQuery({
    queryKey,
    queryFn: () => listCompanies(token!, organizationId!),
    enabled
  });

  const companies = companiesQuery.data?.items ?? [];
  const columns = getCompanyColumns();

  const createMutation = useMutation({
    mutationFn: (input: CreateCompanyInput) => createCompany(token!, organizationId!, input),
    onSuccess: (company) => {
      toast.success('Empresa adicionada', { description: company.legal_name });
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey });
      navigate(companyPath(company.id));
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar a empresa.');
    }
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BuildingIcon className="size-5" />
            Empresas
          </CardTitle>
          <CardDescription>
            Empresas (CNPJs) desta organização. Abra uma empresa para certificado, serviços e fluxos.
          </CardDescription>
        </div>
        <Button disabled={!enabled} onClick={() => setCreating(true)}>
          <PlusIcon />
          Adicionar empresa
        </Button>
      </CardHeader>
      <CardContent>
        {!organizationId ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma organização associada à sua conta no momento.
          </p>
        ) : companiesQuery.isLoading ? (
          <DataTableSkeleton columnCount={7} />
        ) : companiesQuery.isError ? (
          <p className="text-destructive text-sm">
            {companiesQuery.error instanceof ApiError
              ? companiesQuery.error.message
              : 'Não foi possível carregar as empresas.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={companies}
            showSelectionCount={false}
            onRowClick={(company) => navigate(companyPath(company.id))}
          />
        )}
      </CardContent>

      <CompanyFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitting={createMutation.isPending}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />
    </Card>
  );
}
