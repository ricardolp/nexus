import { LoginUser } from '../../../src/user/usecase/login-user.usecase';
import { User } from '../../../src/user/model';
import { FakeCryptoProvider } from '../../mock/fake-crypto.provider';
import { FakeUserRepository } from '../../mock/fake-user.repository';

class FakeJwtProvider {
  async sign() {
    return 'token';
  }

  async verify() {
    return { sub: '1', email: 'a@b.com', role: 'member' };
  }
}

describe('LoginUser', () => {
  it('blocks member login when email is not confirmed', async () => {
    const userRepository = new FakeUserRepository();
    const user = new User({
      nome: 'Ana',
      sobrenome: 'Silva',
      email: 'ana@example.com',
      senha: 'hashed:SenhaForte1!',
      role: 'member',
    });

    await userRepository.create(user);

    const useCase = new LoginUser(
      userRepository,
      new FakeCryptoProvider(),
      new FakeJwtProvider(),
    );

    await expect(
      useCase.execute({
        email: 'ana@example.com',
        senha: 'SenhaForte1!',
      }),
    ).rejects.toThrow('E-mail não confirmado');
  });
});
