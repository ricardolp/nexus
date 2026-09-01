import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileBarChartIcon, PrinterIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  downloadBillingStatementPDF,
  getBillingStatement,
  listOrganizations
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { NovaBrandBar } from '@/components/billing/nova-brand-bar';
import { BillingStatementView, currentMonthRange } from '@/components/billing/statement-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminBillingPage() {
  const token = useAuthStore((s) => s.token);
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = useMemo(() => currentMonthRange(), []);
  const organizationId = searchParams.get('organizationId') ?? '';
  const [from, setFrom] = useState(searchParams.get('from') ?? defaults.from);
  const [to, setTo] = useState(searchParams.get('to') ?? defaults.to);
  const [printing, setPrinting] = useState(false);

  const orgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token
  });

  const statementQuery = useQuery({
    queryKey: ['billing-statement', organizationId, from, to],
    queryFn: () => getBillingStatement(token!, organizationId, { from, to }),
    enabled: !!token && !!organizationId && !!from && !!to
  });

  function applyOrganization(next: string) {
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set('organizationId', next);
    else nextParams.delete('organizationId');
    setSearchParams(nextParams, { replace: true });
  }

  async function printPDF() {
    if (!token || !organizationId) return;
    setPrinting(true);
    try {
      await downloadBillingStatementPDF(token, organizationId, { from, to });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível gerar o PDF.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <NovaBrandBar />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChartIcon className="text-muted-foreground size-5" />
            Extrato de consumo
          </CardTitle>
          <CardDescription>
            Mensageria fiscal por organização e empresa. A impressão em PDF fica restrita ao
            painel admin nesta versão.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm space-y-1.5">
              <Label>Organização</Label>
              <Select value={organizationId || undefined} onValueChange={applyOrganization}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a organização" />
                </SelectTrigger>
                <SelectContent>
                  {(orgsQuery.data?.items ?? []).map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing-from">De</Label>
              <Input id="billing-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing-to">Até</Label>
              <Input id="billing-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={printPDF} disabled={!organizationId || printing || statementQuery.isLoading}>
              <PrinterIcon />
              Imprimir PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {!organizationId ? (
        <p className="text-muted-foreground text-sm">Selecione uma organização para ver o extrato.</p>
      ) : statementQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : statementQuery.isError ? (
        <p className="text-destructive text-sm">
          {statementQuery.error instanceof ApiError
            ? statementQuery.error.message
            : 'Não foi possível carregar o extrato.'}
        </p>
      ) : statementQuery.data ? (
        <BillingStatementView statement={statementQuery.data} />
      ) : null}
    </div>
  );
}
