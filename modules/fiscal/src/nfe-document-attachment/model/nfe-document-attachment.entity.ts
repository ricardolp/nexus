import { FiscalNfeAttachmentKind, FISCAL_NFE_ATTACHMENT_KINDS } from '../../shared/fiscal-nfe-attachment-kind';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeDocumentAttachmentState extends EntityState {
  documentId: string;
  eventId?: string | null;
  kind: FiscalNfeAttachmentKind;
  fileName: string;
  contentType?: string | null;
  storageKey: string;
  content?: string | null;
  sizeBytes?: number | null;
  checksumSha256?: string | null;
}

export class NfeDocumentAttachment extends Entity<NfeDocumentAttachmentState> {
  constructor(props: NfeDocumentAttachmentState) {
    super(props);
  }

  get documentId() {
    return this.props.documentId;
  }

  get eventId() {
    return this.props.eventId;
  }

  get kind() {
    return this.props.kind;
  }

  get fileName() {
    return this.props.fileName;
  }

  get contentType() {
    return this.props.contentType;
  }

  get storageKey() {
    return this.props.storageKey;
  }

  get content() {
    return this.props.content;
  }

  get sizeBytes() {
    return this.props.sizeBytes;
  }

  get checksumSha256() {
    return this.props.checksumSha256;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-document-attachment.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-attachment.kind',
        value: this.kind,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-attachment.fileName',
        value: this.fileName,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-attachment.storageKey',
        value: this.storageKey,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-document-attachment.kind', value: this.kind, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_ATTACHMENT_KINDS])] },
    ]);
  }
}
