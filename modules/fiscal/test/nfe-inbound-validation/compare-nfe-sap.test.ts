import {
  compareNfeWithSapPedido,
  type SapPedidoLineForValidation,
} from '../../src/nfe-inbound-validation/compare-nfe-sap';
import { DEFAULT_VALIDATION_STEP_CONFIG } from '../../src/nfe-inbound-validation/validation-config.types';

/** Espelha o pedido 4504342366 item 30: PIS/COFINS sem valor no SAP. */
const sapLineRealWorld: SapPedidoLineForValidation = {
  pedido: '4504342366',
  item: 30,
  fornecedor: '0000400426',
  quantidade: 12,
  valorLiquido: 476.78,
  impostos: [
    { grupoImposto: 'CBS', valor: 4.29 },
    { grupoImposto: 'IBSS', valor: 0.48 },
    { grupoImposto: 'ICMS', valor: 65.02 },
    { grupoImposto: 'COFI', baseNormal: 476.78 },
    { grupoImposto: 'IPI', valor: 35.22 },
    { grupoImposto: 'PIS', baseNormal: 476.78 },
  ],
};

const sapLineWithTaxValues: SapPedidoLineForValidation = {
  ...sapLineRealWorld,
  impostos: [
    { grupoImposto: 'ICMS', valor: 65.02 },
    { grupoImposto: 'IPI', valor: 35.22 },
    { grupoImposto: 'PIS', valor: 3.1 },
    { grupoImposto: 'COFI', valor: 14.3 },
  ],
};

const realWorldNfeItem = {
  lineNumber: 1,
  codigo: '40007370',
  qty: 12,
  valorTotal: 541.8,
  icms: 65.02,
  xPed: '4504342366',
  nItemPed: '30',
};

const realWorldHeaderTaxes = [
  { tipo: 'ICMS', baseCalculo: 541.8, aliquota: 12, valor: 65.02 },
  { tipo: 'IPI', baseCalculo: 541.8, aliquota: 6.5, valor: 35.22 },
  { tipo: 'PIS', baseCalculo: 476.78, aliquota: 0.65, valor: 3.1 },
  { tipo: 'COFINS', baseCalculo: 476.78, aliquota: 3, valor: 14.3 },
];

describe('compareNfeWithSapPedido', () => {
  test('passa com valores reais quando impostos são somados (vProd e vNF)', () => {
    const result = compareNfeWithSapPedido({
      config: { ...DEFAULT_VALIDATION_STEP_CONFIG, valueTolerance: 0.1 },
      issuerCnpj: '22479375000119',
      totalAmount: 577.02,
      headerTaxes: realWorldHeaderTaxes,
      items: [realWorldNfeItem],
      sapLines: [sapLineRealWorld],
    });

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('ignora PIS e COFINS quando fora de taxComparisonTypes (padrão modelo 55)', () => {
    const result = compareNfeWithSapPedido({
      config: DEFAULT_VALIDATION_STEP_CONFIG,
      issuerCnpj: '22479375000119',
      totalAmount: 577.02,
      headerTaxes: realWorldHeaderTaxes,
      items: [realWorldNfeItem],
      sapLines: [sapLineRealWorld],
    });

    expect(result.issues.some((i) => i.field === 'PIS')).toBe(false);
    expect(result.issues.some((i) => i.field === 'COFINS')).toBe(false);
  });

  test('falha PIS/COFINS quando incluídos em taxComparisonTypes', () => {
    const result = compareNfeWithSapPedido({
      config: {
        ...DEFAULT_VALIDATION_STEP_CONFIG,
        taxComparisonTypes: ['ICMS', 'IPI', 'PIS', 'COFINS'],
      },
      issuerCnpj: '22479375000119',
      totalAmount: 577.02,
      headerTaxes: realWorldHeaderTaxes,
      items: [realWorldNfeItem],
      sapLines: [sapLineRealWorld],
    });

    expect(result.issues.some((i) => i.field === 'PIS')).toBe(true);
    expect(result.issues.some((i) => i.field === 'COFINS')).toBe(true);
  });

  test('passa quando valores e impostos estão dentro da tolerância (legado)', () => {
    const result = compareNfeWithSapPedido({
      config: {
        ...DEFAULT_VALIDATION_STEP_CONFIG,
        valueTolerance: 0.1,
        itemValueTaxTypes: [],
        totalValueTaxTypes: [],
        taxComparisonTypes: ['ICMS', 'IPI'],
      },
      issuerCnpj: '22479375000119',
      totalAmount: 476.78,
      headerTaxes: [
        { tipo: 'ICMS', baseCalculo: 541.8, aliquota: 12, valor: 65.02 },
        { tipo: 'IPI', baseCalculo: 541.8, aliquota: 6.5, valor: 35.22 },
      ],
      items: [
        {
          lineNumber: 1,
          codigo: '40007370',
          qty: 12,
          valorTotal: 476.78,
          icms: 0,
          xPed: '4504342366',
          nItemPed: '30',
        },
      ],
      sapLines: [sapLineWithTaxValues],
    });

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('falha quando valor do item diverge além da tolerância', () => {
    const result = compareNfeWithSapPedido({
      config: DEFAULT_VALIDATION_STEP_CONFIG,
      issuerCnpj: '22479375000119',
      totalAmount: 500,
      headerTaxes: [],
      items: [
        {
          lineNumber: 1,
          codigo: '40007370',
          qty: 12,
          valorTotal: 500,
          icms: 0,
          xPed: '4504342366',
          nItemPed: '30',
        },
      ],
      sapLines: [sapLineWithTaxValues],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.rule === 'validateItemValue')).toBe(true);
  });

  test('falha quando imposto ICMS diverge', () => {
    const result = compareNfeWithSapPedido({
      config: DEFAULT_VALIDATION_STEP_CONFIG,
      issuerCnpj: '22479375000119',
      totalAmount: 476.78,
      headerTaxes: [{ tipo: 'ICMS', baseCalculo: 100, aliquota: 12, valor: 10 }],
      items: [
        {
          lineNumber: 1,
          codigo: '40007370',
          qty: 12,
          valorTotal: 541.8,
          icms: 0,
          xPed: '4504342366',
          nItemPed: '30',
        },
      ],
      sapLines: [sapLineWithTaxValues],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.rule === 'validateTaxes')).toBe(true);
  });

  test('ignora CBS e IBS do SAP quando fora de taxComparisonTypes', () => {
    const result = compareNfeWithSapPedido({
      config: DEFAULT_VALIDATION_STEP_CONFIG,
      issuerCnpj: '22479375000119',
      totalAmount: 577.02,
      headerTaxes: realWorldHeaderTaxes,
      items: [realWorldNfeItem],
      sapLines: [sapLineRealWorld],
    });

    expect(result.issues.some((i) => i.field === 'CBS')).toBe(false);
    expect(result.issues.some((i) => i.field === 'IBS')).toBe(false);
  });
});
