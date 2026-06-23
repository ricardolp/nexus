import {
  FiscalNfeFlowConfigStatus,
  FISCAL_NFE_FLOW_CONFIG_STATUSES,
} from '../../shared/fiscal-nfe-flow-config-status';
import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface NfeFlowConfigState extends EntityState {
  organizationId: string;
  companyId?: string | null;
  model: string;
  name: string;
  version: string;
  active: boolean;
  status: FiscalNfeFlowConfigStatus;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export class NfeFlowConfig extends Entity<NfeFlowConfigState> {
  constructor(props: NfeFlowConfigState) {
    super(props);
  }

  get organizationId() {
    return this.props.organizationId;
  }

  get companyId() {
    return this.props.companyId;
  }

  get model() {
    return this.props.model;
  }

  get name() {
    return this.props.name;
  }

  get version() {
    return this.props.version;
  }

  get active() {
    return this.props.active;
  }

  get status() {
    return this.props.status;
  }

  get createdBy() {
    return this.props.createdBy;
  }

  get updatedBy() {
    return this.props.updatedBy;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-flow-config.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-config.model',
        value: this.model,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-config.name',
        value: this.name,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-config.version',
        value: this.version,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-config.status',
        value: this.status,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_FLOW_CONFIG_STATUSES]),
        ],
      },
    ]);
  }
}
