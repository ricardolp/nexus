import type { ParsedNfeImposto, ParsedNfeItem } from '../nfe-xml-parser/nfe-xml.parser';
import {
  aggregateNfeTaxes,
  aggregateSapTaxes,
  computeSapLineValue,
  type SapTaxLine,
} from './sap-tax.util';
import { withinTolerance } from './tolerance.util';
import type { NfeValidationStepConfig } from './validation-config.types';

export type SapPedidoLineForValidation = {
  pedido: string;
  item: number;
  fornecedor?: string;
  nomeFornecedor?: string;
  quantidade?: number;
  valorBruto?: number;
  valorLiquido?: number;
  valorUnitario?: number;
  material?: string;
  impostos?: SapTaxLine[];
};

export type NfeItemForValidation = {
  lineNumber: number;
  codigo: string;
  qty: number;
  valorTotal: number;
  icms: number;
  xPed?: string;
  nItemPed?: string;
};

export type ValidationIssue = {
  rule: string;
  scope: 'document' | 'item' | 'tax';
  field: string;
  expected?: number | string;
  actual?: number | string;
  message: string;
  lineNumber?: number;
  xPed?: string;
  nItemPed?: string;
};

export type BusinessValidationResult = {
  passed: boolean;
  issues: ValidationIssue[];
};

export type CompareNfeSapInput = {
  config: NfeValidationStepConfig;
  issuerCnpj: string;
  totalAmount: number;
  headerTaxes: ParsedNfeImposto[];
  items: NfeItemForValidation[];
  sapLines: SapPedidoLineForValidation[];
};

function pedidoKey(pedido: string, item: number | string): string {
  const n = parseInt(String(item), 10);
  const normalizedItem = Number.isNaN(n) ? String(item).trim() : String(n);
  return `${pedido.trim()}|${normalizedItem}`;
}

function buildSapLookup(
  sapLines: SapPedidoLineForValidation[],
): Map<string, SapPedidoLineForValidation> {
  const map = new Map<string, SapPedidoLineForValidation>();
  for (const line of sapLines) {
    map.set(pedidoKey(line.pedido, line.item), line);
  }
  return map;
}

function matchedPairs(
  items: NfeItemForValidation[],
  sapLookup: Map<string, SapPedidoLineForValidation>,
): Array<{ nfe: NfeItemForValidation; sap: SapPedidoLineForValidation }> {
  const pairs: Array<{
    nfe: NfeItemForValidation;
    sap: SapPedidoLineForValidation;
  }> = [];

  for (const item of items) {
    const xPed = item.xPed?.trim();
    const nItemPed = item.nItemPed?.trim();
    if (!xPed || !nItemPed) continue;
    const sap = sapLookup.get(pedidoKey(xPed, nItemPed));
    if (sap) pairs.push({ nfe: item, sap });
  }

  return pairs;
}

function addNumericIssue(
  issues: ValidationIssue[],
  input: Omit<ValidationIssue, 'message'> & { label: string },
  expected: number,
  actual: number,
  config: NfeValidationStepConfig,
): void {
  if (withinTolerance(expected, actual, config)) return;
  issues.push({
    ...input,
    expected,
    actual,
    message: `${input.label}: esperado ${expected}, encontrado ${actual}`,
  });
}

export function compareNfeWithSapPedido(
  input: CompareNfeSapInput,
): BusinessValidationResult {
  const issues: ValidationIssue[] = [];
  const { config } = input;
  const sapLookup = buildSapLookup(input.sapLines);
  const pairs = matchedPairs(input.items, sapLookup);

  if (config.validatePurchaseOrder) {
    for (const item of input.items) {
      const xPed = item.xPed?.trim();
      const nItemPed = item.nItemPed?.trim();
      if (!xPed || !nItemPed) continue;
      if (!sapLookup.has(pedidoKey(xPed, nItemPed))) {
        issues.push({
          rule: 'validatePurchaseOrder',
          scope: 'item',
          field: 'pedido',
          xPed,
          nItemPed,
          lineNumber: item.lineNumber,
          message: `Pedido ${xPed} item ${nItemPed} não encontrado no SAP`,
        });
      }
    }
  }

  if (config.validateSupplier && pairs.length > 0) {
    const missingSupplier = pairs.filter(({ sap }) => !sap.fornecedor?.trim());
    for (const { nfe, sap } of missingSupplier) {
      issues.push({
        rule: 'validateSupplier',
        scope: 'item',
        field: 'fornecedor',
        lineNumber: nfe.lineNumber,
        xPed: nfe.xPed,
        nItemPed: nfe.nItemPed,
        message: `Fornecedor SAP não informado no pedido ${sap.pedido}`,
      });
    }
  }

  if (config.validateQuantity) {
    for (const { nfe, sap } of pairs) {
      const expected = sap.quantidade ?? 0;
      addNumericIssue(
        issues,
        {
          rule: 'validateQuantity',
          scope: 'item',
          field: 'quantidade',
          lineNumber: nfe.lineNumber,
          xPed: nfe.xPed,
          nItemPed: nfe.nItemPed,
          label: `Quantidade item ${nfe.lineNumber}`,
        },
        expected,
        nfe.qty,
        config,
      );
    }
  }

  if (config.validateItemValue) {
    for (const { nfe, sap } of pairs) {
      const expected = computeSapLineValue(sap, config.itemValueTaxTypes);
      addNumericIssue(
        issues,
        {
          rule: 'validateItemValue',
          scope: 'item',
          field: 'valor',
          lineNumber: nfe.lineNumber,
          xPed: nfe.xPed,
          nItemPed: nfe.nItemPed,
          label: `Valor item ${nfe.lineNumber}`,
        },
        expected,
        nfe.valorTotal,
        config,
      );
    }
  }

  if (config.validateTotalValue && pairs.length > 0) {
    const sapTotal = pairs.reduce(
      (sum, { sap }) => sum + computeSapLineValue(sap, config.totalValueTaxTypes),
      0,
    );
    addNumericIssue(
      issues,
      {
        rule: 'validateTotalValue',
        scope: 'document',
        field: 'valorTotal',
        label: 'Valor total dos itens com pedido',
      },
      sapTotal,
      input.totalAmount,
      config,
    );
  }

  if (config.validateTaxes) {
    const sapTaxTotals = new Map<string, number>();
    for (const { sap } of pairs) {
      for (const [tipo, valor] of aggregateSapTaxes(sap.impostos)) {
        sapTaxTotals.set(tipo, (sapTaxTotals.get(tipo) ?? 0) + valor);
      }
    }

    const itemIcms = pairs.reduce((sum, { nfe }) => sum + (nfe.icms ?? 0), 0);
    const nfeTaxTotals = aggregateNfeTaxes(input.headerTaxes, itemIcms);

    const comparisonTypes = new Set(
      config.taxComparisonTypes.map((t) => t.trim().toUpperCase()),
    );
    for (const tipo of comparisonTypes) {
      const expected = sapTaxTotals.get(tipo) ?? 0;
      const actual = nfeTaxTotals.get(tipo) ?? 0;
      if (expected === 0 && actual === 0) continue;
      if (withinTolerance(expected, actual, config)) continue;
      issues.push({
        rule: 'validateTaxes',
        scope: 'tax',
        field: tipo,
        expected,
        actual,
        message: `Imposto ${tipo}: SAP ${expected}, XML ${actual}`,
      });
    }
  }

  const hasDivergence = issues.length > 0;
  const shouldBlock =
    hasDivergence &&
    config.validateDivergence &&
    (config.blockOnDivergence || !config.allowManualApproval);

  return {
    passed: !shouldBlock,
    issues,
  };
}

export function mapParsedItemsForValidation(
  items: ParsedNfeItem[],
): NfeItemForValidation[] {
  return items.map((item) => ({
    lineNumber: item.item,
    codigo: item.codigo,
    qty: item.quantidade,
    valorTotal: item.valorTotal,
    icms: item.icms,
    xPed: item.xPed,
    nItemPed: item.nItemPed,
  }));
}
