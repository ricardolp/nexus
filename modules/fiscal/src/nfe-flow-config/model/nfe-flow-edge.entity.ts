import {
  FiscalNfeFlowEdgeCondition,
  FISCAL_NFE_FLOW_EDGE_CONDITIONS,
} from '../../shared/fiscal-nfe-flow-edge-condition';
import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface NfeFlowEdgeState extends EntityState {
  flowConfigId: string;
  sourceStepId: string;
  targetStepId: string;
  conditionType: FiscalNfeFlowEdgeCondition;
  conditionExpression?: Record<string, unknown> | null;
}

export class NfeFlowEdge extends Entity<NfeFlowEdgeState> {
  constructor(props: NfeFlowEdgeState) {
    super(props);
  }

  get flowConfigId() {
    return this.props.flowConfigId;
  }

  get sourceStepId() {
    return this.props.sourceStepId;
  }

  get targetStepId() {
    return this.props.targetStepId;
  }

  get conditionType() {
    return this.props.conditionType;
  }

  get conditionExpression() {
    return this.props.conditionExpression;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-flow-edge.flowConfigId',
        value: this.flowConfigId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-edge.sourceStepId',
        value: this.sourceStepId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-edge.targetStepId',
        value: this.targetStepId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-flow-edge.conditionType',
        value: this.conditionType,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_FLOW_EDGE_CONDITIONS]),
        ],
      },
    ]);
  }
}
