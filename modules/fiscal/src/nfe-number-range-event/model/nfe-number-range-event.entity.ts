import { FiscalNfeNumberRangeEventType, FISCAL_NFE_NUMBER_RANGE_EVENT_TYPES } from '../../shared/fiscal-nfe-number-range-event-type';
import { FiscalNfeEventStatus, FISCAL_NFE_EVENT_STATUSES } from '../../shared/fiscal-nfe-event-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeNumberRangeEventState extends EntityState {
  numberRangeId: string;
  eventType: FiscalNfeNumberRangeEventType;
  eventStatus: FiscalNfeEventStatus;
  sefazStatusCode?: string | null;
  sefazStatusMessage?: string | null;
  protocol?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export class NfeNumberRangeEvent extends Entity<NfeNumberRangeEventState> {
  constructor(props: NfeNumberRangeEventState) {
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

  get sefazStatusCode() {
    return this.props.sefazStatusCode;
  }

  get sefazStatusMessage() {
    return this.props.sefazStatusMessage;
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
        code: 'nfe-number-range-event.numberRangeId',
        value: this.numberRangeId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range-event.eventType',
        value: this.eventType,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-number-range-event.eventStatus',
        value: this.eventStatus,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-number-range-event.eventType', value: this.eventType, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_NUMBER_RANGE_EVENT_TYPES])] },
      { code: 'nfe-number-range-event.eventStatus', value: this.eventStatus, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_EVENT_STATUSES])] },
    ]);
  }
}
