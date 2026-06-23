import { TransactionalEmailProvider } from '@nexus/email';
import { UseCase, ValidationError } from '@nexus/shared';
import { AuthToken } from '../../auth-token/model';
import { AuthTokenRepository } from '../../auth-token/provider';
import { generateRawToken, hashToken } from '../../shared/token.utils';
import { UserRepository } from '../provider';

export interface InviteUserIn {
  email: string;
  invitedBy: string;
  role?: 'member' | 'admin';
}

const TOKEN_TTL_HOURS = 72;

export class InviteUser implements UseCase<InviteUserIn, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly transactionalEmail: TransactionalEmailProvider,
    private readonly appUrl: string,
  ) {}

  async execute(input: InviteUserIn): Promise<void> {
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ValidationError('E-mail já cadastrado');
    }

    const rawToken = generateRawToken();
    const authToken = new AuthToken({
      tipo: 'invite',
      email: input.email,
      tokenHash: hashToken(rawToken),
      expiresAt: this.expiresAt(),
      metadados: {
        invitedBy: input.invitedBy,
        role: input.role ?? 'member',
      },
    });

    authToken.validate();
    await this.authTokenRepository.create(authToken);

    await this.transactionalEmail.send({
      template: 'invite',
      to: input.email,
      variables: {
        inviteUrl: `${this.appUrl}/auth/invite?token=${rawToken}`,
        invitedBy: input.invitedBy,
        expiresIn: `${TOKEN_TTL_HOURS} horas`,
      },
      metadata: { email: input.email },
    });
  }

  private expiresAt(): Date {
    const date = new Date();
    date.setHours(date.getHours() + TOKEN_TTL_HOURS);
    return date;
  }
}
