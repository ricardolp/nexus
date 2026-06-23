import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import { AuthTokenType, AUTH_TOKEN_TYPES } from './auth-token-type';

export interface AuthTokenState extends EntityState {
  tipo: AuthTokenType;
  email: string;
  userId?: string | null;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  metadados?: Record<string, unknown> | null;
}

export class AuthToken extends Entity<AuthTokenState> {
  constructor(props: AuthTokenState) {
    super(props);
  }

  get tipo(): AuthTokenType {
    return this.props.tipo;
  }

  get email(): string {
    return this.props.email;
  }

  get userId(): string | null | undefined {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null | undefined {
    return this.props.usedAt;
  }

  get metadados(): Record<string, unknown> | null | undefined {
    return this.props.metadados;
  }

  public isExpired(referenceDate: Date = new Date()): boolean {
    return this.expiresAt.getTime() <= referenceDate.getTime();
  }

  public isUsed(): boolean {
    return this.usedAt != null;
  }

  public markUsed(usedAt: Date = new Date()): AuthToken {
    return new AuthToken({
      ...this.props,
      usedAt,
      updatedAt: new Date(),
    });
  }

  public validate(): void {
    Validator.validate([
      {
        code: 'authToken.tipo',
        value: this.tipo,
        rules: [new RequiredRule(), new InRule(AUTH_TOKEN_TYPES)],
      },
      {
        code: 'authToken.email',
        value: this.email,
        rules: [new RequiredRule()],
      },
      {
        code: 'authToken.tokenHash',
        value: this.tokenHash,
        rules: [new RequiredRule()],
      },
      {
        code: 'authToken.expiresAt',
        value: this.expiresAt,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
