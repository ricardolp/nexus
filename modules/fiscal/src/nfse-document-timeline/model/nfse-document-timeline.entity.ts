import { FiscalNfseTimelineSource, FISCAL_NFSE_TIMELINE_SOURCES } from '../../shared/fiscal-nfse-timeline-source';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseDocumentTimelineState extends EntityState {
  documentId: string;
  eventId?: string | null;
  source: FiscalNfseTimelineSource;
  title: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdByUserId?: string | null;
}

export class NfseDocumentTimeline extends Entity<NfseDocumentTimelineState> {
  constructor(props: NfseDocumentTimelineState) {
    super(props);
  }

  get documentId() {
    return this.props.documentId;
  }

  get eventId() {
    return this.props.eventId;
  }

  get source() {
    return this.props.source;
  }

  get title() {
    return this.props.title;
  }

  get message() {
    return this.props.message;
  }

  get metadata() {
    return this.props.metadata;
  }

  get createdByUserId() {
    return this.props.createdByUserId;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfse-document-timeline.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-timeline.source',
        value: this.source,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-timeline.title',
        value: this.title,
        rules: [new RequiredRule()],
      },
      { code: 'nfse-document-timeline.source', value: this.source, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_TIMELINE_SOURCES])] },
    ]);
  }
}
