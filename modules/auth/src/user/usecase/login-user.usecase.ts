import { UnauthorizedError, UseCase } from '@nexus/shared';
import { User } from '../model';
import { CryptoProvider, JwtProvider, UserRepository } from '../provider';

export interface LoginUserIn {
  email: string;
  senha: string;
}

export interface LoginUserOut {
  accessToken: string;
  user: {
    id: string;
    nome: string;
    sobrenome: string;
    email: string;
    role: string;
  };
}

export class LoginUser implements UseCase<LoginUserIn, LoginUserOut> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cryptoProvider: CryptoProvider,
    private readonly jwtProvider: JwtProvider,
  ) {}

  async execute(input: LoginUserIn): Promise<LoginUserOut> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    const passwordMatches = await this.cryptoProvider.compare(
      input.senha,
      user.senha,
    );

    if (!passwordMatches) {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    if (user.role === 'member' && !user.emailConfirmadoEm) {
      throw new UnauthorizedError('E-mail não confirmado');
    }

    const updatedUser = user.clone({ ultimoLoginEm: new Date() });
    await this.userRepository.update(updatedUser);

    const accessToken = await this.jwtProvider.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        nome: user.nome,
        sobrenome: user.sobrenome,
        email: user.email,
        role: user.role,
      },
    };
  }
}
