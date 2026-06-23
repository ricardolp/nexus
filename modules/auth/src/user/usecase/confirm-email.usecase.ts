import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { AuthTokenRepository } from '../../auth-token/provider';
import { hashToken } from '../../shared/token.utils';
import { User } from '../model';
import { UserRepository } from '../provider';

export interface ConfirmEmailIn {
  token: string;
}

export class ConfirmEmail implements UseCase<ConfirmEmailIn, void> {
  constructor(
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: ConfirmEmailIn): Promise<void> {
    const authToken = await this.authTokenRepository.findByTokenHash(
      hashToken(input.token),
    );

    if (!authToken || authToken.tipo !== 'email_confirmation') {
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
      throw new NotFoundError('Usuário não encontrado');
    }

    const confirmedUser = user.clone({
      emailConfirmadoEm: new Date(),
    });

    await this.userRepository.update(confirmedUser);
    await this.authTokenRepository.update(authToken.markUsed());
  }
}
