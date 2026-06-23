import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import { INTEGRATION_API_SCOPES } from '@nexus/shared';

export interface IntegrationTokenState extends EntityState {
  organizationId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  scopes: string[];
  createdByUserId: string;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}

export class IntegrationToken extends Entity<IntegrationTokenState> {
  constructor(props: IntegrationTokenState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get name(): string {
    return this.props.name;
  }

  get tokenPrefix(): string {
    return this.props.tokenPrefix;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get scopes(): string[] {
    return this.props.scopes;
  }

  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  get lastUsedAt(): Date | null | undefined {
    return this.props.lastUsedAt;
  }

  get revokedAt(): Date | null | undefined {
    return this.props.revokedAt;
  }

  get expiresAt(): Date | null | undefined {
    return this.props.expiresAt;
  }

  isRevoked(): boolean {
    return this.revokedAt != null;
  }

  isExpired(referenceDate: Date = new Date()): boolean {
    return this.expiresAt != null && this.expiresAt.getTime() <= referenceDate.getTime();
  }

  hasScope(scope: string): boolean {
    return this.scopes.includes(scope);
  }

  touchLastUsed(at: Date = new Date()): IntegrationToken {
    return new IntegrationToken({
      ...this.props,
      lastUsedAt: at,
      updatedAt: new Date(),
    });
  }

  revoke(revokedAt: Date = new Date()): IntegrationToken {
    return new IntegrationToken({
      ...this.props,
      revokedAt,
      updatedAt: new Date(),
    });
  }

  validate(): void {
    Validator.validate([
      {
        code: 'integrationToken.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'integrationToken.name',
        value: this.name,
        rules: [new RequiredRule()],
      },
      {
        code: 'integrationToken.tokenHash',
        value: this.tokenHash,
        rules: [new RequiredRule()],
      },
      {
        code: 'integrationToken.scopes',
        value: this.scopes,
        rules: [new RequiredRule()],
      },
      ...this.scopes.map((scope, index) => ({
        code: `integrationToken.scopes.${index}`,
        value: scope,
        rules: [new InRule([...INTEGRATION_API_SCOPES])],
      })),
    ]);
  }
}
