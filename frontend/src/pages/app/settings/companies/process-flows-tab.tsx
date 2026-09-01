import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVerticalIcon, PlusIcon, WorkflowIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { deleteInboundScenario, listInboundScenarios } from '@/lib/endpoints';
import type { ApiCompany } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { resolutionChipLabels } from '../integrations/flows/resolution-criteria';
import { buildPipelineSteps, StepPipeline } from '../integrations/flows/step-pipeline';
import { PROCESS_TEMPLATES } from '../integrations/flows/templates';
import { companyProcessFlowPath } from './paths';

export function CompanyProcessFlowsTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const enabled = !!token && !!organizationId;

  const scenariosQuery = useQuery({
    queryKey: ['inbound-scenarios', organizationId],
    queryFn: () => listInboundScenarios(token!, organizationId!),
    enabled
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInboundScenario(token!, organizationId!, id),
    onSuccess: () => {
      toast.success('Fluxo removido');
      void queryClient.invalidateQueries({ queryKey: ['inbound-scenarios', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover o fluxo.');
    }
  });

  const scenarios = (scenariosQuery.data?.items ?? []).filter(
    (s) => s.scenario.organization_company_id === company.id
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <WorkflowIcon className="size-4" />
            Fluxos de processo
          </h3>
          <p className="text-muted-foreground text-sm">
            Etapas do SAP que rodam automaticamente para as notas desta empresa.
          </p>
        </div>
        <Button type="button" onClick={() => navigate(companyProcessFlowPath(company.id, 'new'))}>
          <PlusIcon />
          Novo fluxo
        </Button>
      </div>

      {scenariosQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : scenariosQuery.isError ? (
        <p className="text-destructive text-sm">
          {scenariosQuery.error instanceof ApiError
            ? scenariosQuery.error.message
            : 'Não foi possível carregar os fluxos.'}
        </p>
      ) : scenarios.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm">
          <WorkflowIcon className="text-muted-foreground/60 size-8" />
          Nenhum fluxo nesta empresa. Sem um cenário, documentos recebidos ficam em “Ação necessária” e
          nenhuma chamada é feita ao SAP.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {scenarios.map((s) => {
            const template = PROCESS_TEMPLATES.find((t) => t.code === s.scenario.process_template_code);
            const chips = resolutionChipLabels(s.scenario);
            const pipelineSteps = template ? buildPipelineSteps(template.steps, s.rule) : [];

            return (
              <Card key={s.scenario.id} className={!s.scenario.is_active ? 'opacity-60' : undefined}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm font-semibold">
                      {template?.label ?? s.scenario.process_template_code}
                    </CardTitle>
                    {chips.length === 0 ? (
                      <CardDescription className="mt-1">Qualquer nota desta empresa</CardDescription>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {chips.map((chip) => (
                          <Badge key={chip} variant="secondary" className="font-normal">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="size-8 shrink-0 p-0">
                        <span className="sr-only">Abrir menu</span>
                        <MoreVerticalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => navigate(companyProcessFlowPath(company.id, s.scenario.id))}
                      >
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(s.scenario.id)}
                      >
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        s.scenario.is_active
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {s.scenario.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  {s.rule.responsible_emails?.length ? (
                    <p
                      className="text-muted-foreground truncate text-xs"
                      title={s.rule.responsible_emails.join(', ')}
                    >
                      Responsáveis: {s.rule.responsible_emails.join(', ')}
                    </p>
                  ) : null}
                  {pipelineSteps.length > 0 && (
                    <div className="border-t pt-3">
                      <StepPipeline steps={pipelineSteps} size="sm" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
