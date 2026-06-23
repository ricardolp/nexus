import { ValidationException } from '@nexus/shared';
import { OrganizationCompany } from '../../../src/organization-company/model';

const VALID_CNPJ = '04252011000110';

function getValidationMessages(callback: () => void): string[] {
  try {
    callback();
    return [];
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }
}

describe('OrganizationCompany', () => {
  const validProps = {
    organizationId: 'org-1',
    cnpj: VALID_CNPJ,
    razaoSocial: 'Empresa Exemplo LTDA',
    status: 'active' as const,
  };

  test('deve criar empresa valida com id e timestamps', () => {
    const company = new OrganizationCompany(validProps);

    expect(company.organizationId).toBe('org-1');
    expect(company.cnpj).toBe(VALID_CNPJ);
    expect(company.razaoSocial).toBe('Empresa Exemplo LTDA');
    expect(company.status).toBe('active');
    expect(company.id).toEqual(expect.any(String));
    expect(company.createdAt).toBeInstanceOf(Date);
    expect(company.updatedAt).toBeInstanceOf(Date);
    expect(company.deletedAt).toBeNull();
  });

  test('deve validar empresa com sucesso', () => {
    const company = new OrganizationCompany(validProps);

    expect(() => company.validate()).not.toThrow();
  });

  test('deve falhar quando cnpj for invalido', () => {
    const messages = getValidationMessages(() =>
      new OrganizationCompany({ ...validProps, cnpj: '123' }).validate(),
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  test('deve falhar quando razao social for curta', () => {
    const messages = getValidationMessages(() =>
      new OrganizationCompany({ ...validProps, razaoSocial: 'A' }).validate(),
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  test('deve falhar quando status for invalido', () => {
    const messages = getValidationMessages(() =>
      new OrganizationCompany({
        ...validProps,
        status: 'pending' as 'active',
      }).validate(),
    );

    expect(messages.length).toBeGreaterThan(0);
  });
});
