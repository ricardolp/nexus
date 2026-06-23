import { FiscalNfeEnvironment, FISCAL_NFE_ENVIRONMENTS } from '../../shared/fiscal-nfe-environment';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeNumberRangeState extends EntityState {
  organizationId: string;
  companyId: string;
  environment: FiscalNfeEnvironment;
  model: string;
  series: number;
  numberFrom: number;
  numberTo: number;
  justification?: string | null;
  protocol?: string | null;
  authorizedAt?: Date | null;
}

export class NfeNumberRange extends Entity<NfeNumberRangeState> {
  constructor(props: NfeNumberRangeState) {
    super(props);
  }

  get organizationId() {
    return this.props.organizationId;
  }

  get companyId() {
    return this.props.companyId;
  }

  get environment() {
    return this.props.environment;
  }

  get model() {
    return this.props.model;
  }

  get series() {
    return this.props.series;
  }

  get numberFrom() {
    return this.props.numberFrom;
  }

  get numberTo() {
    return this.props.numberTo;
  }

  get justification() {
    return this.props.justification;
  }

  get protocol() {
    return this.props.protocol;
  }

  get authorizedAt() {
    return this.props.authorizedAt;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-number-range.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range.companyId',
        value: this.companyId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range.environment',
        value: this.environment,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range.series',
        value: this.series,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range.numberFrom',
        value: this.numberFrom,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range.numberTo',
        value: this.numberTo,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-number-range.environment', value: this.environment, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_ENVIRONMENTS])] },
    ]);
  }
}
