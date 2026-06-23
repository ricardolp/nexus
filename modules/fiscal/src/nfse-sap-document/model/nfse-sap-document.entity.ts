import { FiscalNfseSapDocumentType, FISCAL_NFSE_SAP_DOCUMENT_TYPES } from '../../shared/fiscal-nfse-sap-document-type';
import { FiscalNfseSapDocumentStatus, FISCAL_NFSE_SAP_DOCUMENT_STATUSES } from '../../shared/fiscal-nfse-sap-document-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseSapDocumentState extends EntityState {
  documentId: string;
  itemId?: string | null;
  documentType: FiscalNfseSapDocumentType;
  docNumber: string;
  itemNumber?: string | null;
  fiscalYear?: string | null;
  status: FiscalNfseSapDocumentStatus;
  rawResponse?: Record<string, unknown> | null;
}

export class NfseSapDocument extends Entity<NfseSapDocumentState> {
  constructor(props: NfseSapDocumentState) {
    super(props);
  }

  get documentId() {
    return this.props.documentId;
  }

  get itemId() {
    return this.props.itemId;
  }

  get documentType() {
    return this.props.documentType;
  }

  get docNumber() {
    return this.props.docNumber;
  }

  get itemNumber() {
    return this.props.itemNumber;
  }

  get fiscalYear() {
    return this.props.fiscalYear;
  }

  get status() {
    return this.props.status;
  }

  get rawResponse() {
    return this.props.rawResponse;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfse-sap-document.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-sap-document.documentType',
        value: this.documentType,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-sap-document.docNumber',
        value: this.docNumber,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-sap-document.status',
        value: this.status,
        rules: [new RequiredRule()],
      },
      { code: 'nfse-sap-document.documentType', value: this.documentType, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_SAP_DOCUMENT_TYPES])] },
      { code: 'nfse-sap-document.status', value: this.status, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_SAP_DOCUMENT_STATUSES])] },
    ]);
  }
}
