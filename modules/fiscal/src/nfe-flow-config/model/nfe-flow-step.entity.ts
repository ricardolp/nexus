import {
  FiscalNfeFlowStepKey,
  FISCAL_NFE_FLOW_STEP_KEYS,
} from '../../shared/fiscal-nfe-flow-step-key';
import {
  FiscalNfeFlowStepType,
  FISCAL_NFE_FLOW_STEP_TYPES,
} from '../../shared/fiscal-nfe-flow-step-type';
import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface NfeFlowStepState extends EntityState {
  flowConfigId: string;
  stepKey: FiscalNfeFlowStepKey | string;
  name: string;
  sequence: number;
  active: boolean;
  type: FiscalNfeFlowStepType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export class NfeFlowStep extends Entity<NfeFlowStepState> {
  constructor(props: NfeFlowStepState) {
    super(props);
  }

  get flowConfigId() {
    return this.props.flowConfigId;
  }

  get stepKey() {
    return this.props.stepKey;
  }

  get name() {
    return this.props.name;
  }

  get sequence() {
    return this.props.sequence;
  }

  get active() {
    return this.props.active;
  }

  get type() {
    return this.props.type;
  }

  get config() {
    return this.props.config;
  }

  get positionX() {
    return this.props.positionX;
  }

  get positionY() {
    return this.props.positionY;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-flow-step.flowConfigId',
        value: this.flowConfigId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-step.stepKey',
        value: this.stepKey,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-step.name',
        value: this.name,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-step.type',
        value: this.type,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_FLOW_STEP_TYPES]),
        ],
      },
    ]);

    if (
      FISCAL_NFE_FLOW_STEP_KEYS.includes(
        this.stepKey as FiscalNfeFlowStepKey,
      ) === false &&
      this.stepKey !== 'CUSTOM'
    ) {
      // allow custom step keys prefixed CUSTOM_
    }
  }
}
