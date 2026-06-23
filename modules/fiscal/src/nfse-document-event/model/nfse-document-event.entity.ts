import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import {
  FiscalNfseEventStatus,
  FISCAL_NFSE_EVENT_STATUSES,
} from '../../shared/fiscal-nfse-event-status';
import {
  FiscalNfseEventType,
  FISCAL_NFSE_EVENT_TYPES,
} from '../../shared/fiscal-nfse-event-type';

export interface NfseDocumentEventState extends EntityState {
  organizationId: string;
  documentId: string;
  eventType: FiscalNfseEventType;
  eventStatus: FiscalNfseEventStatus;
  sequence: number;
  prefeituraStatusCode?: string | null;
  prefeituraStatusMessage?: string | null;
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

export class NfseDocumentEvent extends Entity<NfseDocumentEventState> {
  constructor(props: NfseDocumentEventState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get documentId(): string {
    return this.props.documentId;
  }

  get eventType(): FiscalNfseEventType {
    return this.props.eventType;
  }

  get eventStatus(): FiscalNfseEventStatus {
    return this.props.eventStatus;
  }

  get sequence(): number {
    return this.props.sequence;
  }

  get prefeituraStatusCode(): string | null | undefined {
    return this.props.prefeituraStatusCode;
  }

  get prefeituraStatusMessage(): string | null | undefined {
    return this.props.prefeituraStatusMessage;
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

  withEventStatus(eventStatus: FiscalNfseEventStatus): NfseDocumentEvent {
    return new NfseDocumentEvent({
      ...this.props,
      eventStatus,
      updatedAt: new Date(),
    });
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfse-document-event.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-event.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-event.eventType',
        value: this.eventType,
        rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_EVENT_TYPES])],
      },
      {
        code: 'nfse-document-event.eventStatus',
        value: this.eventStatus,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFSE_EVENT_STATUSES]),
        ],
      },
      {
        code: 'nfse-document-event.sequence',
        value: this.sequence,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
