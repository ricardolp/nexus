import { NfeDocument } from '../src/nfe-document/model/nfe-document.entity';

describe('NfeDocument', () => {
  const baseProps = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    companyId: '22222222-2222-2222-2222-222222222222',
    direction: 'outbound' as const,
    environment: 'homologation' as const,
    status: 'draft' as const,
    model: '55',
    series: 1,
    number: 100,
    issuerCnpj: '11222333000181',
  };

  it('deve criar documento com campos obrigatórios', () => {
    const doc = new NfeDocument(baseProps);
    doc.validate();
    expect(doc.status).toBe('draft');
    expect(doc.series).toBe(1);
    expect(doc.issuerCnpj).toBe('11222333000181');
  });

  it('deve transitar status com withStatus', () => {
    const doc = new NfeDocument(baseProps);
    const authorized = doc.withStatus('authorized', '1'.repeat(44));
    expect(authorized.status).toBe('authorized');
    expect(authorized.accessKey).toHaveLength(44);
  });
});
