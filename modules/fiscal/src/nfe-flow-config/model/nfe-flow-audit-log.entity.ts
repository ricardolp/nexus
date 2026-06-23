import { Entity, EntityState, RequiredRule, Validator } from '@nexus/shared';

export interface NfeFlowAuditLogState extends EntityState {
  flowConfigId: string;
  version: string;
  userId?: string | null;
  action: string;
  stepKey?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

export class NfeFlowAuditLog extends Entity<NfeFlowAuditLogState> {
  constructor(props: NfeFlowAuditLogState) {
    super(props);
  }

  get flowConfigId() {
    return this.props.flowConfigId;
  }

  get version() {
    return this.props.version;
  }

  get userId() {
    return this.props.userId;
  }

  get action() {
    return this.props.action;
  }

  get stepKey() {
    return this.props.stepKey;
  }

  get before() {
    return this.props.before;
  }

  get after() {
    return this.props.after;
  }

  get reason() {
    return this.props.reason;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-flow-audit-log.flowConfigId',
        value: this.flowConfigId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-audit-log.action',
        value: this.action,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
