import { FiscalNfeSapDocumentType, FISCAL_NFE_SAP_DOCUMENT_TYPES } from '../../shared/fiscal-nfe-sap-document-type';
import { FiscalNfeSapDocumentStatus, FISCAL_NFE_SAP_DOCUMENT_STATUSES } from '../../shared/fiscal-nfe-sap-document-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeSapDocumentState extends EntityState {
  documentId: string;
  itemId?: string | null;
  documentType: FiscalNfeSapDocumentType;
  docNumber: string;
  itemNumber?: string | null;
  fiscalYear?: string | null;
  status: FiscalNfeSapDocumentStatus;
  rawResponse?: Record<string, unknown> | null;
}

export class NfeSapDocument extends Entity<NfeSapDocumentState> {
  constructor(props: NfeSapDocumentState) {
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
        code: 'nfe-sap-document.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-sap-document.documentType',
        value: this.documentType,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-sap-document.docNumber',
        value: this.docNumber,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-sap-document.status',
        value: this.status,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-sap-document.documentType', value: this.documentType, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_SAP_DOCUMENT_TYPES])] },
      { code: 'nfe-sap-document.status', value: this.status, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_SAP_DOCUMENT_STATUSES])] },
    ]);
  }
}
