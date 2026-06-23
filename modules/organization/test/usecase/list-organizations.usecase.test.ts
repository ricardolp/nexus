import { ListOrganizations } from '../../src/usecase/list-organizations.usecase';
import { FakeOrganizationRepository } from '../mock/fake-organization.repository';
import { Organization } from '../../src/organization/model';

describe('ListOrganizations', () => {
  it('lists organizations when actor is global admin', async () => {
    const repository = new FakeOrganizationRepository();
    const org = new Organization({ nome: 'Acme', slug: 'acme' });
    org.validate();
    await repository.create(org);

    const useCase = new ListOrganizations(repository);
    const result = await useCase.execute({
      page: 1,
      perPage: 20,
      actorRole: 'admin',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].nome).toBe('Acme');
  });

  it('rejects non-admin actors', async () => {
    const useCase = new ListOrganizations(new FakeOrganizationRepository());

    await expect(
      useCase.execute({ page: 1, perPage: 20, actorRole: 'member' }),
    ).rejects.toThrow('Somente administradores podem listar organizações');
  });
});
