import { RegisterUser } from '../../../src/user/usecase/register-user.usecase';
import { FakeAuthTokenRepository } from '../../mock/fake-auth-token.repository';
import { FakeCryptoProvider } from '../../mock/fake-crypto.provider';
import { FakeTransactionalEmailProvider } from '../../mock/fake-transactional-email.provider';
import { FakeUserRepository } from '../../mock/fake-user.repository';

describe('RegisterUser', () => {
  it('creates user and sends welcome and confirmation emails', async () => {
    const userRepository = new FakeUserRepository();
    const authTokenRepository = new FakeAuthTokenRepository();
    const transactionalEmail = new FakeTransactionalEmailProvider();

    const useCase = new RegisterUser(
      new FakeCryptoProvider(),
      userRepository,
      authTokenRepository,
      transactionalEmail,
      'http://localhost:3000',
      'Nexus',
    );

    await useCase.execute({
      nome: 'Ana',
      sobrenome: 'Silva',
      email: 'ana@example.com',
      senha: 'SenhaForte1!',
    });

    const user = await userRepository.findByEmail('ana@example.com');
    expect(user).not.toBeNull();

    expect(transactionalEmail.sent).toHaveLength(2);
    expect(transactionalEmail.sent[0]?.template).toBe('welcome');
    expect(transactionalEmail.sent[1]?.template).toBe('email_confirmation');
    expect(transactionalEmail.sent[1]?.variables.confirmUrl).toContain('token=');

    const tokens = await authTokenRepository.findPage({
      page: 1,
      perPage: 10,
    });
    expect(tokens.total).toBe(1);
    expect(tokens.items[0]?.tipo).toBe('email_confirmation');
  });
});
