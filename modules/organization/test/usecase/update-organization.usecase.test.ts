import { Organization } from '../../src/organization/model';
import { UpdateOrganization } from '../../src/usecase/update-organization.usecase';
import { FakeOrganizationRepository } from '../mock/fake-organization.repository';

describe('UpdateOrganization', () => {
  it('updates organization fields when actor is global admin', async () => {
    const repository = new FakeOrganizationRepository();
    const organization = new Organization({
      nome: 'Acme',
      slug: 'acme',
      logo: null,
    });

    await repository.create(organization);

    const useCase = new UpdateOrganization(repository);
    const updated = await useCase.execute({
      organizationId: organization.id,
      nome: 'Acme Corp',
      slug: 'acme-corp',
      logo: 'data:image/jpeg;base64,abc',
      actorRole: 'admin',
    });

    expect(updated.nome).toBe('Acme Corp');
    expect(updated.slug).toBe('acme-corp');
    expect(updated.logo).toBe('data:image/jpeg;base64,abc');
  });

  it('rejects slug already in use by another organization', async () => {
    const repository = new FakeOrganizationRepository();
    const organizationA = new Organization({ nome: 'Acme', slug: 'acme' });
    const organizationB = new Organization({ nome: 'Beta', slug: 'beta' });

    await repository.create(organizationA);
    await repository.create(organizationB);

    const useCase = new UpdateOrganization(repository);

    await expect(
      useCase.execute({
        organizationId: organizationA.id,
        slug: 'beta',
        actorRole: 'admin',
      }),
    ).rejects.toThrow('Slug já utilizado');
  });

  it('rejects non-admin actors', async () => {
    const repository = new FakeOrganizationRepository();
    const organization = new Organization({ nome: 'Acme', slug: 'acme' });
    await repository.create(organization);

    const useCase = new UpdateOrganization(repository);

    await expect(
      useCase.execute({
        organizationId: organization.id,
        nome: 'New Name',
        actorRole: 'member',
      }),
    ).rejects.toThrow('Somente administradores podem alterar organizações');
  });
});
