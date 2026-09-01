import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZapIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { listCompanyServices, updateCompanyServiceStatus } from '@/lib/endpoints';
import type { ApiCompany, ApiCompanyService } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

export function CompanyServicesTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const enabled = !!token && !!organizationId;
  const queryKey = ['company-services', organizationId, company.id];

  const servicesQuery = useQuery({
    queryKey,
    queryFn: () => listCompanyServices(token!, organizationId!, company.id),
    enabled
  });

  const services = servicesQuery.data?.items ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ service, status }: { service: ApiCompanyService; status: 'active' | 'disabled' }) =>
      updateCompanyServiceStatus(token!, organizationId!, company.id, service.service_id, status),
    onMutate: async ({ service, status }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ items: ApiCompanyService[] }>(queryKey);
      queryClient.setQueryData<{ items: ApiCompanyService[] }>(queryKey, (old) => ({
        items: (old?.items ?? []).map((s) => (s.service_id === service.service_id ? { ...s, status } : s))
      }));
      return { previous };
    },
    onSuccess: (service) => {
      toast.success(service.status === 'active' ? 'Serviço ativado' : 'Serviço desativado', {
        description: service.service_name
      });
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o serviço.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <PlugZapIcon className="size-4" />
          Serviços
        </CardTitle>
        <CardDescription>
          Ative ou desative os serviços fiscais desta empresa. Documentos de um serviço inativo são recusados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {servicesQuery.isLoading ? (
          <div className="flex flex-col gap-3 py-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : servicesQuery.isError ? (
          <p className="text-destructive py-2 text-sm">
            {servicesQuery.error instanceof ApiError
              ? servicesQuery.error.message
              : 'Não foi possível carregar os serviços.'}
          </p>
        ) : services.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">Nenhum serviço disponível no catálogo.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {services.map((service) => {
              const active = service.status === 'active';
              return (
                <div key={service.service_id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{service.service_name}</p>
                    <p className="text-muted-foreground text-xs">{service.service_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`service-${service.service_id}`} className="text-muted-foreground text-sm font-normal">
                      {active ? 'Ativo' : 'Inativo'}
                    </Label>
                    <Switch
                      id={`service-${service.service_id}`}
                      checked={active}
                      onCheckedChange={(checked) =>
                        statusMutation.mutate({ service, status: checked ? 'active' : 'disabled' })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
