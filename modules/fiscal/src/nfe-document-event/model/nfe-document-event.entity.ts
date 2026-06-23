import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import {
  FiscalNfeEventStatus,
  FISCAL_NFE_EVENT_STATUSES,
} from '../../shared/fiscal-nfe-event-status';
import {
  FiscalNfeEventType,
  FISCAL_NFE_EVENT_TYPES,
} from '../../shared/fiscal-nfe-event-type';

export interface NfeDocumentEventState extends EntityState {
  organizationId: string;
  documentId: string;
  eventType: FiscalNfeEventType;
  eventStatus: FiscalNfeEventStatus;
  sequence: number;
  sefazStatusCode?: string | null;
  sefazStatusMessage?: string | null;
  protocol?: string | null;
  correlationId?: string | null;
  requestSummary?: Record<string, unknown> | null;
  responseSummary?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  triggeredByUserId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export class NfeDocumentEvent extends Entity<NfeDocumentEventState> {
  constructor(props: NfeDocumentEventState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get documentId(): string {
    return this.props.documentId;
  }

  get eventType(): FiscalNfeEventType {
    return this.props.eventType;
  }

  get eventStatus(): FiscalNfeEventStatus {
    return this.props.eventStatus;
  }

  get sequence(): number {
    return this.props.sequence;
  }

  get sefazStatusCode(): string | null | undefined {
    return this.props.sefazStatusCode;
  }

  get sefazStatusMessage(): string | null | undefined {
    return this.props.sefazStatusMessage;
  }

  get protocol(): string | null | undefined {
    return this.props.protocol;
  }

  get correlationId(): string | null | undefined {
    return this.props.correlationId;
  }

  get requestSummary(): Record<string, unknown> | null | undefined {
    return this.props.requestSummary;
  }

  get responseSummary(): Record<string, unknown> | null | undefined {
    return this.props.responseSummary;
  }

  get errorCode(): string | null | undefined {
    return this.props.errorCode;
  }

  get errorMessage(): string | null | undefined {
    return this.props.errorMessage;
  }

  get triggeredByUserId(): string | null | undefined {
    return this.props.triggeredByUserId;
  }

  get startedAt(): Date | null | undefined {
    return this.props.startedAt;
  }

  get completedAt(): Date | null | undefined {
    return this.props.completedAt;
  }

  withEventStatus(eventStatus: FiscalNfeEventStatus): NfeDocumentEvent {
    return new NfeDocumentEvent({
      ...this.props,
      eventStatus,
      updatedAt: new Date(),
    });
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-document-event.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-event.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-event.eventType',
        value: this.eventType,
        rules: [new RequiredRule(), new InRule([...FISCAL_NFE_EVENT_TYPES])],
      },
      {
        code: 'nfe-document-event.eventStatus',
        value: this.eventStatus,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_EVENT_STATUSES]),
        ],
      },
      {
        code: 'nfe-document-event.sequence',
        value: this.sequence,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
