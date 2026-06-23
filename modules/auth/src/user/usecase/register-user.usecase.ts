import {
  StrongPasswordRule,
  UseCase,
  ValidationError,
  Validator,
} from '@nexus/shared';
import { TransactionalEmailProvider } from '@nexus/email';
import { AuthToken } from '../../auth-token/model';
import { AuthTokenRepository } from '../../auth-token/provider';
import { generateRawToken, hashToken } from '../../shared/token.utils';
import { User } from '../model';
import { CryptoProvider, UserRepository } from '../provider';

export interface RegisterUserIn {
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
}

const TOKEN_TTL_HOURS = 24;

export class RegisterUser implements UseCase<RegisterUserIn, void> {
  constructor(
    private readonly cryptoProvider: CryptoProvider,
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly transactionalEmail: TransactionalEmailProvider,
    private readonly appUrl: string,
    private readonly appName: string,
  ) {}

  async execute(input: RegisterUserIn): Promise<void> {
    Validator.validate([
      {
        code: 'user.senha',
        value: input.senha,
        rules: [new StrongPasswordRule()],
      },
    ]);

    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ValidationError('E-mail já cadastrado');
    }

    const hashedPassword = await this.cryptoProvider.encrypt(input.senha);
    const user = new User({
      nome: input.nome,
      sobrenome: input.sobrenome,
      email: input.email,
      senha: hashedPassword,
      role: 'member',
    });

    user.validate();
    const createdUser = await this.userRepository.create(user);

    const rawToken = generateRawToken();
    const authToken = new AuthToken({
      tipo: 'email_confirmation',
      email: createdUser.email,
      userId: createdUser.id,
      tokenHash: hashToken(rawToken),
      expiresAt: this.expiresAt(),
    });

    authToken.validate();
    await this.authTokenRepository.create(authToken);

    const loginUrl = `${this.appUrl}/login`;
    const confirmUrl = `${this.appUrl}/auth/confirm-email?token=${rawToken}`;

    await this.transactionalEmail.send({
      template: 'welcome',
      to: createdUser.email,
      variables: {
        nome: createdUser.nome,
        appName: this.appName,
        loginUrl,
      },
      metadata: { userId: createdUser.id },
    });

    await this.transactionalEmail.send({
      template: 'email_confirmation',
      to: createdUser.email,
      variables: {
        nome: createdUser.nome,
        confirmUrl,
        expiresIn: `${TOKEN_TTL_HOURS} horas`,
      },
      metadata: { userId: createdUser.id },
    });
  }

  private expiresAt(): Date {
    const date = new Date();
    date.setHours(date.getHours() + TOKEN_TTL_HOURS);
    return date;
  }
}
