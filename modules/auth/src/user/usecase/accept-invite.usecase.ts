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

export interface AcceptInviteIn {
  token: string;
  nome: string;
  sobrenome: string;
  senha: string;
}

export interface AcceptInviteOut {
  userId: string;
  metadados?: Record<string, unknown> | null;
}

export class AcceptInvite implements UseCase<AcceptInviteIn, AcceptInviteOut> {
  constructor(
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly userRepository: UserRepository,
    private readonly cryptoProvider: CryptoProvider,
    private readonly transactionalEmail: TransactionalEmailProvider,
    private readonly appUrl: string,
    private readonly appName: string,
  ) {}

  async execute(input: AcceptInviteIn): Promise<AcceptInviteOut> {
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

    if (!authToken || authToken.tipo !== 'invite') {
      throw new ValidationError('Token inválido');
    }

    if (authToken.isUsed() || authToken.isExpired()) {
      throw new ValidationError('Token expirado ou já utilizado');
    }

    const existingUser = await this.userRepository.findByEmail(authToken.email);
    if (existingUser) {
      throw new ValidationError('E-mail já cadastrado');
    }

    const role =
      (authToken.metadados?.role as 'member' | 'admin' | undefined) ??
      'member';

    const hashedPassword = await this.cryptoProvider.encrypt(input.senha);
    const user = new User({
      nome: input.nome,
      sobrenome: input.sobrenome,
      email: authToken.email,
      senha: hashedPassword,
      role,
      emailConfirmadoEm: new Date(),
    });

    user.validate();
    const createdUser = await this.userRepository.create(user);
    await this.authTokenRepository.update(authToken.markUsed());

    await this.transactionalEmail.send({
      template: 'welcome',
      to: createdUser.email,
      variables: {
        nome: createdUser.nome,
        appName: this.appName,
        loginUrl: `${this.appUrl}/login`,
      },
      metadata: { userId: createdUser.id },
    });

    return {
      userId: createdUser.id,
      metadados: authToken.metadados,
    };
  }
}
