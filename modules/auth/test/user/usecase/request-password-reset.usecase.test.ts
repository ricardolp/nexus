import { RequestPasswordReset } from '../../../src/user/usecase/request-password-reset.usecase';
import { User } from '../../../src/user/model';
import { FakeAuthTokenRepository } from '../../mock/fake-auth-token.repository';
import { FakeTransactionalEmailProvider } from '../../mock/fake-transactional-email.provider';
import { FakeUserRepository } from '../../mock/fake-user.repository';

describe('RequestPasswordReset', () => {
  it('sends password reset email when user exists', async () => {
    const userRepository = new FakeUserRepository();
    const authTokenRepository = new FakeAuthTokenRepository();
    const transactionalEmail = new FakeTransactionalEmailProvider();

    const user = new User({
      nome: 'Ana',
      sobrenome: 'Silva',
      email: 'ana@example.com',
      senha: 'hashed',
      role: 'member',
    });

    await userRepository.create(user);

    const useCase = new RequestPasswordReset(
      userRepository,
      authTokenRepository,
      transactionalEmail,
      'http://localhost:3000',
    );

    await useCase.execute({ email: 'ana@example.com' });

    expect(transactionalEmail.sent).toHaveLength(1);
    expect(transactionalEmail.sent[0]?.template).toBe('password_reset');
  });

  it('does nothing when user does not exist', async () => {
    const transactionalEmail = new FakeTransactionalEmailProvider();

    const useCase = new RequestPasswordReset(
      new FakeUserRepository(),
      new FakeAuthTokenRepository(),
      transactionalEmail,
      'http://localhost:3000',
    );

    await useCase.execute({ email: 'missing@example.com' });
    expect(transactionalEmail.sent).toHaveLength(0);
  });
});
