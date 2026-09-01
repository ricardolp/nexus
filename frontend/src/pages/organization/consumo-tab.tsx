import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChartIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { getBillingStatement } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { NovaBrandBar } from '@/components/billing/nova-brand-bar';
import { BillingStatementView, currentMonthRange } from '@/components/billing/statement-view';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export function OrganizationConsumoTab() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const defaults = useMemo(() => currentMonthRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const statementQuery = useQuery({
    queryKey: ['billing-statement', organizationId, from, to],
    queryFn: () => getBillingStatement(token!, organizationId!, { from, to }),
    enabled: !!token && !!organizationId && !!from && !!to
  });

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <NovaBrandBar />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChartIcon className="text-muted-foreground size-5" />
            Consumo de mensageria
          </CardTitle>
          <CardDescription>
            Quantidade de documentos e eventos fiscais cobrados no período, agrupados por empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="org-billing-from">De</Label>
            <Input id="org-billing-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-billing-to">Até</Label>
            <Input id="org-billing-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {statementQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : statementQuery.isError ? (
        <p className="text-destructive text-sm">
          {statementQuery.error instanceof ApiError
            ? statementQuery.error.message
            : 'Não foi possível carregar o consumo.'}
        </p>
      ) : statementQuery.data ? (
        <BillingStatementView statement={statementQuery.data} />
      ) : (
        <p className="text-muted-foreground text-sm">Selecione o período para consultar o consumo.</p>
      )}
    </div>
  );
}
