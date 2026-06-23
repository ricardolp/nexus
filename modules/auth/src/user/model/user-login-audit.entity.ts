import {
  DateRule,
  Entity,
  EntityState,
  MaxLengthRule,
  RequiredRule,
  UuidRule,
  Validator,
} from '@nexus/shared';

export interface UserLoginAuditState extends EntityState {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  loggedInAt: Date;
}

export class UserLoginAudit extends Entity<UserLoginAuditState> {
  constructor(props: UserLoginAuditState) {
    super(props);
  }

  get userId(): string {
    return this.props.userId;
  }

  get ipAddress(): string | null | undefined {
    return this.props.ipAddress;
  }

  get userAgent(): string | null | undefined {
    return this.props.userAgent;
  }

  get loggedInAt(): Date {
    return this.props.loggedInAt;
  }

  public validate(): void {
    Validator.validate([
      {
        code: 'userLoginAudit.userId',
        value: this.userId,
        rules: [new RequiredRule(), new UuidRule()],
      },
      {
        code: 'userLoginAudit.ipAddress',
        value: this.ipAddress,
        rules: [new MaxLengthRule(45)],
      },
      {
        code: 'userLoginAudit.userAgent',
        value: this.userAgent,
        rules: [new MaxLengthRule(512)],
      },
      {
        code: 'userLoginAudit.loggedInAt',
        value: this.loggedInAt,
        rules: [new RequiredRule(), new DateRule()],
      },
    ]);
  }
}
