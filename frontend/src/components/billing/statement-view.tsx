import { formatCNPJ } from '@/pages/app/settings/companies/columns';
import type { ApiBillingCompany, ApiBillingMetric, ApiBillingStatement } from '@/lib/api-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

function formatPeriod(from: string, to: string) {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  return `${new Date(from).toLocaleDateString('pt-BR', opts)} – ${new Date(to).toLocaleDateString('pt-BR', opts)}`;
}

function MetricsTable({ metrics, total }: { metrics: ApiBillingMetric[]; total: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-nova-ink hover:bg-nova-ink">
          <TableHead className="text-white">Descrição</TableHead>
          <TableHead className="text-white">Unidade</TableHead>
          <TableHead className="text-right text-white">Quantidade</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((metric) => (
          <TableRow key={metric.code}>
            <TableCell>{metric.label}</TableCell>
            <TableCell className="text-muted-foreground">{metric.unit}</TableCell>
            <TableCell className="text-right tabular-nums">{metric.quantity.toLocaleString('pt-BR')}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-nova-gold hover:bg-nova-gold text-nova-ink">
          <TableCell className="font-medium">Total</TableCell>
          <TableCell>mensagem</TableCell>
          <TableCell className="text-right font-medium tabular-nums">{total.toLocaleString('pt-BR')}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function CompanyBlock({ company }: { company: ApiBillingCompany }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">{company.legal_name}</h3>
        <p className="text-muted-foreground text-sm tabular-nums">{formatCNPJ(company.cnpj)}</p>
      </div>
      <MetricsTable metrics={company.metrics} total={company.total_quantity} />
    </div>
  );
}

export function BillingStatementView({ statement }: { statement: ApiBillingStatement }) {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Consumo total</CardTitle>
          <CardDescription>
            {statement.legal_name} · {formatPeriod(statement.period_from, statement.period_to)} ·{' '}
            {statement.total_quantity.toLocaleString('pt-BR')} mensagens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable metrics={statement.totals} total={statement.total_quantity} />
        </CardContent>
      </Card>

      {statement.companies.map((company) => (
        <Card key={company.company_id}>
          <CardContent className="pt-6">
            <CompanyBlock company={company} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}

function toISODate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
