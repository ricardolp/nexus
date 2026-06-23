import { UseCase } from '@nexus/shared';
import { randomBytes } from 'crypto';
import { User } from '../model';
import { CryptoProvider, JwtProvider, UserRepository } from '../provider';
import { LoginUserOut } from './login-user.usecase';

export interface LoginMicrosoftIn {
  email: string;
  nome: string;
  sobrenome: string;
}

export class LoginMicrosoft implements UseCase<LoginMicrosoftIn, LoginUserOut> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cryptoProvider: CryptoProvider,
    private readonly jwtProvider: JwtProvider,
  ) {}

  async execute(input: LoginMicrosoftIn): Promise<LoginUserOut> {
    const normalizedEmail = input.email.trim().toLowerCase();
    let user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      const randomPassword = randomBytes(32).toString('hex');
      const hashedPassword = await this.cryptoProvider.encrypt(randomPassword);
      const newUser = new User({
        nome: input.nome.trim() || 'Usuário',
        sobrenome: input.sobrenome.trim() || 'Microsoft',
        email: normalizedEmail,
        senha: hashedPassword,
        role: 'member',
        emailConfirmadoEm: new Date(),
      });
      newUser.validate();
      user = await this.userRepository.create(newUser);
    } else if (user.role === 'member' && !user.emailConfirmadoEm) {
      user = await this.userRepository.update(
        user.clone({ emailConfirmadoEm: new Date() }),
      );
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
