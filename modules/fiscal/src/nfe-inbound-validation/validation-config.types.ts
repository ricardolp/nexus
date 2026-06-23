export const AVAILABLE_VALUE_TAX_TYPES = ['ICMS', 'IPI', 'PIS', 'COFINS'] as const;

export type ValueTaxType = (typeof AVAILABLE_VALUE_TAX_TYPES)[number];

export type NfeValidationStepConfig = {
  validatePurchaseOrder: boolean;
  validateSupplier: boolean;
  validateTotalValue: boolean;
  validateItemValue: boolean;
  validateQuantity: boolean;
  validateTaxes: boolean;
  validateDivergence: boolean;
  valueTolerance: number;
  percentageTolerance: number;
  blockOnDivergence: boolean;
  allowManualApproval: boolean;
  itemValueTaxTypes: string[];
  totalValueTaxTypes: string[];
  taxComparisonTypes: string[];
};

export const DEFAULT_ITEM_VALUE_TAX_TYPES: string[] = ['ICMS'];
export const DEFAULT_TOTAL_VALUE_TAX_TYPES: string[] = ['ICMS', 'IPI'];
/** Modelo 55: SAP costuma não retornar valor de PIS/COFINS no pedido. */
export const DEFAULT_TAX_COMPARISON_TYPES: string[] = ['ICMS', 'IPI'];

export const DEFAULT_VALIDATION_STEP_CONFIG: NfeValidationStepConfig = {
  validatePurchaseOrder: true,
  validateSupplier: true,
  validateTotalValue: true,
  validateItemValue: true,
  validateQuantity: true,
  validateTaxes: true,
  validateDivergence: true,
  valueTolerance: 0.05,
  percentageTolerance: 0.5,
  blockOnDivergence: true,
  allowManualApproval: true,
  itemValueTaxTypes: [...DEFAULT_ITEM_VALUE_TAX_TYPES],
  totalValueTaxTypes: [...DEFAULT_TOTAL_VALUE_TAX_TYPES],
  taxComparisonTypes: [...DEFAULT_TAX_COMPARISON_TYPES],
};

function parseTaxTypesArray(
  raw: unknown,
  fallback: string[],
): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  return raw
    .map((v) => String(v).trim().toUpperCase())
    .filter((v) => AVAILABLE_VALUE_TAX_TYPES.includes(v as ValueTaxType));
}

export function parseValidationStepConfig(
  raw: Record<string, unknown> | null | undefined,
): NfeValidationStepConfig {
  if (!raw) return { ...DEFAULT_VALIDATION_STEP_CONFIG };

  return {
    validatePurchaseOrder: raw.validatePurchaseOrder !== false,
    validateSupplier: Boolean(raw.validateSupplier),
    validateTotalValue: Boolean(raw.validateTotalValue),
    validateItemValue: Boolean(raw.validateItemValue),
    validateQuantity: Boolean(raw.validateQuantity),
    validateTaxes: Boolean(raw.validateTaxes),
    validateDivergence: Boolean(raw.validateDivergence),
    valueTolerance: Number(raw.valueTolerance ?? 0.05),
    percentageTolerance: Number(raw.percentageTolerance ?? 0.5),
    blockOnDivergence: raw.blockOnDivergence !== false,
    allowManualApproval: raw.allowManualApproval !== false,
    itemValueTaxTypes: parseTaxTypesArray(
      raw.itemValueTaxTypes,
      DEFAULT_ITEM_VALUE_TAX_TYPES,
    ),
    totalValueTaxTypes: parseTaxTypesArray(
      raw.totalValueTaxTypes,
      DEFAULT_TOTAL_VALUE_TAX_TYPES,
    ),
    taxComparisonTypes: parseTaxTypesArray(
      raw.taxComparisonTypes,
      DEFAULT_TAX_COMPARISON_TYPES,
    ),
  };
}
