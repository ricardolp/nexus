import { TransactionalEmailProvider } from '@nexus/email';
import {
  StrongPasswordRule,
  UseCase,
  ValidationError,
  Validator,
} from '@nexus/shared';
import { AuthTokenRepository } from '../../auth-token/provider';
import { hashToken } from '../../shared/token.utils';
import { User } from '../model';
import { CryptoProvider, UserRepository } from '../provider';

export interface ResetPasswordIn {
  token: string;
  senha: string;
}

export class ResetPassword implements UseCase<ResetPasswordIn, void> {
  constructor(
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly userRepository: UserRepository,
    private readonly cryptoProvider: CryptoProvider,
    private readonly transactionalEmail: TransactionalEmailProvider,
    private readonly appUrl: string,
  ) {}

  async execute(input: ResetPasswordIn): Promise<void> {
    Validator.validate([
      {
        code: 'user.senha',
        value: input.senha,
        rules: [new StrongPasswordRule()],
      },
    ]);

    const authToken = await this.authTokenRepository.findByTokenHash(
      hashToken(input.token),
    );

    if (!authToken || authToken.tipo !== 'password_reset') {
      throw new ValidationError('Token inválido');
    }

    if (authToken.isUsed() || authToken.isExpired()) {
      throw new ValidationError('Token expirado ou já utilizado');
    }

    if (!authToken.userId) {
      throw new ValidationError('Token inválido');
    }

    const user = await this.userRepository.findById(authToken.userId);
    if (!user) {
      throw new ValidationError('Token inválido');
    }

    const hashedPassword = await this.cryptoProvider.encrypt(input.senha);
    const updatedUser = new User({
      id: user.id,
      nome: user.nome,
      sobrenome: user.sobrenome,
      email: user.email,
      senha: hashedPassword,
      emailConfirmadoEm: user.emailConfirmadoEm,
      role: user.role,
      ultimoLoginEm: user.ultimoLoginEm,
      createdAt: user.createdAt,
      updatedAt: new Date(),
      deletedAt: user.deletedAt,
    });

    updatedUser.validate();
    await this.userRepository.update(updatedUser);
    await this.authTokenRepository.update(authToken.markUsed());

    await this.transactionalEmail.send({
      template: 'password_changed',
      to: user.email,
      variables: {
        nome: user.nome,
        supportUrl: `${this.appUrl}/suporte`,
      },
      metadata: { userId: user.id },
    });
  }
}
