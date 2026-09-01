import type { ApiItemTaxes, ApiNFeTotals } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from './format';
import { cn } from '@/lib/utils';

const TAX_STYLE: Record<string, string> = {
  ICMS: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
  ST: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300',
  FCP: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300',
  IPI: 'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300',
  PIS: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  COFINS: 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300',
  II: 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'
};

function TaxChip({ code, amount, rate, cst }: { code: string; amount?: number; rate?: number; cst?: string }) {
  if (!amount) return null;
  const extra = [
    cst ? `CST ${cst}` : null,
    rate ? `${rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : null
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal', TAX_STYLE[code])}>
      <span className="font-medium">{code}</span>
      <span className="tabular-nums">{formatCurrency(amount)}</span>
      {extra && <span className="text-[10px] opacity-80">{extra}</span>}
    </Badge>
  );
}

export function ItemTaxChips({ taxes }: { taxes?: ApiItemTaxes | null }) {
  if (!taxes) return null;
  const chips = [
    { code: 'ICMS', tax: taxes.icms },
    { code: 'IPI', tax: taxes.ipi },
    { code: 'PIS', tax: taxes.pis },
    { code: 'COFINS', tax: taxes.cofins }
  ].filter((c) => c.tax?.amount);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ code, tax }) => (
        <TaxChip key={code} code={code} amount={tax?.amount} rate={tax?.rate} cst={tax?.cst || tax?.csosn} />
      ))}
    </div>
  );
}

export function TotalsTaxChips({ totals }: { totals?: ApiNFeTotals | null }) {
  if (!totals) return null;
  const entries: { code: string; amount: number }[] = [
    { code: 'ICMS', amount: totals.icms },
    { code: 'ST', amount: totals.icms_st },
    { code: 'FCP', amount: totals.fcp },
    { code: 'IPI', amount: totals.ipi },
    { code: 'PIS', amount: totals.pis },
    { code: 'COFINS', amount: totals.cofins },
    { code: 'II', amount: totals.ii }
  ].filter((e) => e.amount > 0);
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum imposto destacado nesta nota.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <TaxChip key={e.code} code={e.code} amount={e.amount} />
      ))}
    </div>
  );
}
