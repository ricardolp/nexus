import { FiscalNfseNumberRangeEventType, FISCAL_NFSE_NUMBER_RANGE_EVENT_TYPES } from '../../shared/fiscal-nfse-number-range-event-type';
import { FiscalNfseEventStatus, FISCAL_NFSE_EVENT_STATUSES } from '../../shared/fiscal-nfse-event-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseNumberRangeEventState extends EntityState {
  numberRangeId: string;
  eventType: FiscalNfseNumberRangeEventType;
  eventStatus: FiscalNfseEventStatus;
  prefeituraStatusCode?: string | null;
  prefeituraStatusMessage?: string | null;
  protocol?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export class NfseNumberRangeEvent extends Entity<NfseNumberRangeEventState> {
  constructor(props: NfseNumberRangeEventState) {
    super(props);
  }

  get numberRangeId() {
    return this.props.numberRangeId;
  }

  get eventType() {
    return this.props.eventType;
  }

  get eventStatus() {
    return this.props.eventStatus;
  }

  get prefeituraStatusCode() {
    return this.props.prefeituraStatusCode;
  }

  get prefeituraStatusMessage() {
    return this.props.prefeituraStatusMessage;
  }

  get protocol() {
    return this.props.protocol;
  }

  get errorCode() {
    return this.props.errorCode;
  }

  get errorMessage() {
    return this.props.errorMessage;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfse-number-range-event.numberRangeId',
        value: this.numberRangeId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range-event.eventType',
        value: this.eventType,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-number-range-event.eventStatus',
        value: this.eventStatus,
        rules: [new RequiredRule()],
      },
      { code: 'nfse-number-range-event.eventType', value: this.eventType, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_NUMBER_RANGE_EVENT_TYPES])] },
      { code: 'nfse-number-range-event.eventStatus', value: this.eventStatus, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_EVENT_STATUSES])] },
    ]);
  }
}
