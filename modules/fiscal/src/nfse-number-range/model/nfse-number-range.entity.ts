import { FiscalNfseEnvironment, FISCAL_NFSE_ENVIRONMENTS } from '../../shared/fiscal-nfse-environment';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseNumberRangeState extends EntityState {
  organizationId: string;
  companyId: string;
  environment: FiscalNfseEnvironment;
  model: string;
  series: number;
  numberFrom: number;
  numberTo: number;
  justification?: string | null;
  protocol?: string | null;
  authorizedAt?: Date | null;
}

export class NfseNumberRange extends Entity<NfseNumberRangeState> {
  constructor(props: NfseNumberRangeState) {
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
        code: 'nfse-number-range.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range.companyId',
        value: this.companyId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range.environment',
        value: this.environment,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range.series',
        value: this.series,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range.numberFrom',
        value: this.numberFrom,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range.numberTo',
        value: this.numberTo,
        rules: [new RequiredRule()],
      },
      { code: 'nfse-number-range.environment', value: this.environment, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_ENVIRONMENTS])] },
    ]);
  }
}
