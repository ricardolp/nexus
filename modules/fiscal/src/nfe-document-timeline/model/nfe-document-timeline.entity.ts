import { FiscalNfeTimelineSource, FISCAL_NFE_TIMELINE_SOURCES } from '../../shared/fiscal-nfe-timeline-source';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeDocumentTimelineState extends EntityState {
  documentId: string;
  eventId?: string | null;
  source: FiscalNfeTimelineSource;
  title: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdByUserId?: string | null;
}

export class NfeDocumentTimeline extends Entity<NfeDocumentTimelineState> {
  constructor(props: NfeDocumentTimelineState) {
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
        code: 'nfe-document-timeline.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-timeline.source',
        value: this.source,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-timeline.title',
        value: this.title,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-document-timeline.source', value: this.source, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_TIMELINE_SOURCES])] },
    ]);
  }
}
