import { FiscalNfseAttachmentKind, FISCAL_NFSE_ATTACHMENT_KINDS } from '../../shared/fiscal-nfse-attachment-kind';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseDocumentAttachmentState extends EntityState {
  documentId: string;
  eventId?: string | null;
  kind: FiscalNfseAttachmentKind;
  fileName: string;
  contentType?: string | null;
  storageKey: string;
  content?: string | null;
  sizeBytes?: number | null;
  checksumSha256?: string | null;
}

export class NfseDocumentAttachment extends Entity<NfseDocumentAttachmentState> {
  constructor(props: NfseDocumentAttachmentState) {
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
        code: 'nfse-document-attachment.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-attachment.kind',
        value: this.kind,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-attachment.fileName',
        value: this.fileName,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-attachment.storageKey',
        value: this.storageKey,
        rules: [new RequiredRule()],
      },
      { code: 'nfse-document-attachment.kind', value: this.kind, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_ATTACHMENT_KINDS])] },
    ]);
  }
}
