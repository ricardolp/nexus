import { ValidationException } from '@nexus/shared';
import { OrganizationSettings } from '../../../src/organization-settings/model';

function getValidationMessages(callback: () => void): string[] {
  try {
    callback();
    return [];
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }
}

describe('OrganizationSettings', () => {
  const validProps = {
    organizationId: 'org-1',
    maxCompanies: 5,
  };

  test('deve criar configuracoes validas com id e timestamps', () => {
    const settings = new OrganizationSettings(validProps);

    expect(settings.organizationId).toBe('org-1');
    expect(settings.maxCompanies).toBe(5);
    expect(settings.id).toEqual(expect.any(String));
    expect(settings.createdAt).toBeInstanceOf(Date);
    expect(settings.updatedAt).toBeInstanceOf(Date);
  });

  test('deve validar configuracoes com sucesso', () => {
    const settings = new OrganizationSettings(validProps);

    expect(() => settings.validate()).not.toThrow();
  });

  test('deve falhar quando maxCompanies for menor que 1', () => {
    const messages = getValidationMessages(() =>
      new OrganizationSettings({ ...validProps, maxCompanies: 0 }).validate(),
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  test('deve falhar quando maxCompanies nao for inteiro', () => {
    const messages = getValidationMessages(() =>
      new OrganizationSettings({
        ...validProps,
        maxCompanies: 1.5,
      }).validate(),
    );

    expect(messages.length).toBeGreaterThan(0);
  });
});
