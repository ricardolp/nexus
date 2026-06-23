import {
  FiscalNfeFlowInstanceStatus,
  FISCAL_NFE_FLOW_INSTANCE_STATUSES,
} from '../../shared/fiscal-nfe-flow-instance-status';
import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface NfeFlowInstanceState extends EntityState {
  flowConfigId: string;
  documentId: string;
  model: string;
  status: FiscalNfeFlowInstanceStatus;
  currentStepId?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
}

export class NfeFlowInstance extends Entity<NfeFlowInstanceState> {
  constructor(props: NfeFlowInstanceState) {
    super(props);
  }

  get flowConfigId() {
    return this.props.flowConfigId;
  }

  get documentId() {
    return this.props.documentId;
  }

  get model() {
    return this.props.model;
  }

  get status() {
    return this.props.status;
  }

  get currentStepId() {
    return this.props.currentStepId;
  }

  get startedAt() {
    return this.props.startedAt;
  }

  get finishedAt() {
    return this.props.finishedAt;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-flow-instance.flowConfigId',
        value: this.flowConfigId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-instance.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-instance.status',
        value: this.status,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_FLOW_INSTANCE_STATUSES]),
        ],
      },
    ]);
  }
}
