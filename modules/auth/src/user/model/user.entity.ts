import {
  EmailRule,
  Entity,
  EntityState,
  InRule,
  MaxLengthRule,
  MinLengthRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import { UserRole } from './user-role';

export interface UserState extends EntityState {
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
  emailConfirmadoEm?: Date | null;
  role: UserRole;
  ultimoLoginEm?: Date | null;
}

export class User extends Entity<UserState> {
  constructor(props: UserState) {
    super(props);
  }

  get nome(): string {
    return this.props.nome;
  }

  get sobrenome(): string {
    return this.props.sobrenome;
  }

  get email(): string {
    return this.props.email;
  }

  get senha(): string {
    return this.props.senha;
  }

  get emailConfirmadoEm(): Date | null | undefined {
    return this.props.emailConfirmadoEm;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get ultimoLoginEm(): Date | null | undefined {
    return this.props.ultimoLoginEm;
  }

  public validate(): void {
    Validator.validate([
      {
        code: 'user.nome',
        value: this.nome,
        rules: [
          new RequiredRule(),
          new MinLengthRule(2),
          new MaxLengthRule(80),
        ],
      },
      {
        code: 'user.sobrenome',
        value: this.sobrenome,
        rules: [
          new RequiredRule(),
          new MinLengthRule(2),
          new MaxLengthRule(80),
        ],
      },
      {
        code: 'user.email',
        value: this.email,
        rules: [new RequiredRule(), new EmailRule()],
      },
      {
        code: 'user.senha',
        value: this.senha,
        rules: [new RequiredRule(), new MinLengthRule(8)],
      },
      {
        code: 'user.role',
        value: this.role,
        rules: [new RequiredRule(), new InRule(['member', 'admin'])],
      },
    ]);
  }
}
