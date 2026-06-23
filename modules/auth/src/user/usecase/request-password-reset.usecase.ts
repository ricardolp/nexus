import { TransactionalEmailProvider } from '@nexus/email';
import { UseCase } from '@nexus/shared';
import { AuthToken } from '../../auth-token/model';
import { AuthTokenRepository } from '../../auth-token/provider';
import { generateRawToken, hashToken } from '../../shared/token.utils';
import { UserRepository } from '../provider';

export interface RequestPasswordResetIn {
  email: string;
}

const TOKEN_TTL_HOURS = 1;

export class RequestPasswordReset
  implements UseCase<RequestPasswordResetIn, void>
{
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly transactionalEmail: TransactionalEmailProvider,
    private readonly appUrl: string,
  ) {}

  async execute(input: RequestPasswordResetIn): Promise<void> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      return;
    }

    const rawToken = generateRawToken();
    const authToken = new AuthToken({
      tipo: 'password_reset',
      email: user.email,
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: this.expiresAt(),
    });

    authToken.validate();
    await this.authTokenRepository.create(authToken);

    await this.transactionalEmail.send({
      template: 'password_reset',
      to: user.email,
      variables: {
        nome: user.nome,
        resetUrl: `${this.appUrl}/auth/reset-password?token=${rawToken}`,
        expiresIn: `${TOKEN_TTL_HOURS} hora`,
      },
      metadata: { userId: user.id },
    });
  }

  private expiresAt(): Date {
    const date = new Date();
    date.setHours(date.getHours() + TOKEN_TTL_HOURS);
    return date;
  }
}
