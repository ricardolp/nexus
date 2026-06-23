import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseNfeXml,
  parseNfeXmlDetail,
  resolveItemMiroAmount,
  resolveOrganizationCompanyDocument,
} from '../../src/nfe-xml-parser/nfe-xml.parser';

const fixturesDir = join(__dirname, '../fixtures');

function loadFixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

describe('nfe-xml.parser', () => {
  it('parses inbound document', () => {
    const parsed = parseNfeXml(loadFixture('nfe_entrada_152756.xml'));
    expect(parsed.direction).toBe('inbound');
    expect(parsed.number).toBe(70398);
    expect(parsed.series).toBe(1);
    expect(parsed.status).toBe('received');
    expect(parsed.accessKey.length).toBeGreaterThanOrEqual(43);
    expect(resolveOrganizationCompanyDocument(parsed)).toBe('13677964000200');
  });

  it('parses inbound detail with items and taxes', () => {
    const detail = parseNfeXmlDetail(loadFixture('nfe_entrada_152756.xml'));
    expect(detail.itens.length).toBe(3);
    expect(detail.valorProdutos).toBeGreaterThan(0);
    expect(detail.emitente.razaoSocial).toContain('POLIFILTRO');
    expect(detail.destinatario.document).toBe('13677964000200');
    expect(detail.impostos.some((i) => i.tipo === 'ICMS')).toBe(true);
  });

  it('extracts xPed and nItemPed from item', () => {
    const detail = parseNfeXmlDetail(
      loadFixture('42260522479375000119550010000197301906383658.xml'),
    );
    expect(detail.itens.length).toBe(1);
    expect(detail.itens[0]?.xPed).toBe('4504342366');
    expect(detail.itens[0]?.nItemPed).toBe('30');
    expect(detail.itens[0]?.unidade).toBe('PC');
  });

  it('extracts commercial unit from inbound items', () => {
    const detail = parseNfeXmlDetail(loadFixture('nfe_entrada_152756.xml'));
    expect(detail.itens[0]?.unidade).toBe('EA');
  });

  it('resolves itemAmount from PIS vBC for MIRO', () => {
    const detail = parseNfeXmlDetail(
      loadFixture('42260522479375000119550010000197301906383658.xml'),
    );
    expect(detail.itens[0]?.valorTotal).toBe(541.8);
    expect(detail.itens[0]?.itemAmount).toBe(476.78);
  });

  it('resolves itemAmount from PIS vBC when present on entrada items', () => {
    const detail = parseNfeXmlDetail(loadFixture('nfe_entrada_152756.xml'));
    expect(detail.itens[0]?.valorTotal).toBe(2418.35);
    expect(detail.itens[0]?.itemAmount).toBe(2418.35);
  });

  it('falls back to vProd minus vICMS when PIS and COFINS are absent', () => {
    const amount = resolveItemMiroAmount(
      {
        ICMS: {
          ICMS00: {
            vICMS: '65.02',
          },
        },
      },
      541.8,
    );
    expect(amount).toBe(476.78);
  });
});
