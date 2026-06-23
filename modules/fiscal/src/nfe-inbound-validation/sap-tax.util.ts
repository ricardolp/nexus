export type SapTaxLine = {
  tipo?: string;
  grupoImposto?: string;
  baseNormal?: number;
  baseOutras?: number;
  aliquota?: number;
  valor?: number;
};

export type NfeTaxLine = {
  tipo: string;
  baseCalculo: number;
  aliquota: number;
  valor: number;
};

export type SapLineForValue = {
  valorBruto?: number;
  valorLiquido?: number;
  impostos?: SapTaxLine[];
};

const SAP_GROUP_TO_NFE: Record<string, string> = {
  ICMS: 'ICMS',
  IPI: 'IPI',
  PIS: 'PIS',
  COFI: 'COFINS',
  COFINS: 'COFINS',
  CBS: 'CBS',
  IBSS: 'IBS',
  WACO: 'COFINS',
  WAPI: 'PIS',
};

export function normalizeSapTaxGroup(grupoImposto?: string, tipo?: string): string {
  const group = (grupoImposto ?? tipo ?? '').trim().toUpperCase();
  return SAP_GROUP_TO_NFE[group] ?? group;
}

export function sumSapTaxesByTypes(
  impostos: SapTaxLine[] | undefined,
  types: string[],
): number {
  const allowed = new Set(types.map((t) => t.trim().toUpperCase()));
  let total = 0;
  for (const tax of impostos ?? []) {
    const tipo = normalizeSapTaxGroup(tax.grupoImposto, tax.tipo);
    if (!tipo || !allowed.has(tipo)) continue;
    if (tax.valor == null || !Number.isFinite(tax.valor)) continue;
    total += tax.valor;
  }
  return total;
}

export function computeSapLineValue(
  sap: SapLineForValue,
  taxTypes: string[],
): number {
  const base = sap.valorLiquido ?? sap.valorBruto ?? 0;
  return base + sumSapTaxesByTypes(sap.impostos, taxTypes);
}

export function aggregateSapTaxes(
  impostos: SapTaxLine[] | undefined,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tax of impostos ?? []) {
    const tipo = normalizeSapTaxGroup(tax.grupoImposto, tax.tipo);
    if (!tipo || tax.valor == null || !Number.isFinite(tax.valor)) continue;
    totals.set(tipo, (totals.get(tipo) ?? 0) + tax.valor);
  }
  return totals;
}

export function aggregateNfeTaxes(
  headerTaxes: NfeTaxLine[],
  itemIcms: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tax of headerTaxes) {
    const tipo = tax.tipo.trim().toUpperCase();
    if (!tipo || !Number.isFinite(tax.valor)) continue;
    totals.set(tipo, (totals.get(tipo) ?? 0) + tax.valor);
  }
  const headerIcms = totals.get('ICMS') ?? 0;
  if (itemIcms > 0 && headerIcms === 0) {
    totals.set('ICMS', (totals.get('ICMS') ?? 0) + itemIcms);
  }
  return totals;
}
