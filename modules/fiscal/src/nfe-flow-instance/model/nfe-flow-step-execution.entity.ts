import {
  FiscalNfeFlowStepExecutionStatus,
  FISCAL_NFE_FLOW_STEP_EXECUTION_STATUSES,
} from '../../shared/fiscal-nfe-flow-step-execution-status';
import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface NfeFlowStepExecutionState extends EntityState {
  instanceId: string;
  stepKey: string;
  status: FiscalNfeFlowStepExecutionStatus;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export class NfeFlowStepExecution extends Entity<NfeFlowStepExecutionState> {
  constructor(props: NfeFlowStepExecutionState) {
    super(props);
  }

  get instanceId() {
    return this.props.instanceId;
  }

  get stepKey() {
    return this.props.stepKey;
  }

  get status() {
    return this.props.status;
  }

  get message() {
    return this.props.message;
  }

  get payload() {
    return this.props.payload;
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
        code: 'nfe-flow-step-execution.instanceId',
        value: this.instanceId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-step-execution.stepKey',
        value: this.stepKey,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-step-execution.status',
        value: this.status,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_FLOW_STEP_EXECUTION_STATUSES]),
        ],
      },
    ]);
  }
}
