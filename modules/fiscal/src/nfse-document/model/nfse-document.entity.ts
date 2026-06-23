import {
  CnpjRule,
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import { FiscalDocumentDirection, FISCAL_DOCUMENT_DIRECTIONS } from '../../shared/fiscal-document-direction';
import { FiscalNfseEnvironment, FISCAL_NFSE_ENVIRONMENTS } from '../../shared/fiscal-nfse-environment';
import { FiscalNfseDocumentStatus, FISCAL_NFSE_DOCUMENT_STATUSES } from '../../shared/fiscal-nfse-document-status';

export interface NfseDocumentState extends EntityState {
  organizationId: string;
  companyId: string;
  direction: FiscalDocumentDirection;
  environment: FiscalNfseEnvironment;
  status: FiscalNfseDocumentStatus;
  model: string;
  series: number;
  number: number;
  accessKey?: string | null;
  issuerCnpj: string;
  recipientDocument?: string | null;
  recipientName?: string | null;
  totalAmount?: string | null;
  issuedAt?: Date | null;
  authorizedAt?: Date | null;
  cancelledAt?: Date | null;
  authorizationProtocol?: string | null;
  cancellationProtocol?: string | null;
  prefeituraStatusCode?: string | null;
  prefeituraStatusMessage?: string | null;
  sapDocumentId?: string | null;
  sapOrderId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
  rpsNumber?: number | null;
  rpsSeries?: string | null;
  verificationCode?: string | null;
  serviceCode?: string | null;
  municipalityCode?: string | null;
  issRetained?: boolean | null;
  serviceDescription?: string | null;
}

export class NfseDocument extends Entity<NfseDocumentState> {
  constructor(props: NfseDocumentState) {
    super(props);
  }

  get organizationId(): string { return this.props.organizationId; }
  get companyId(): string { return this.props.companyId; }
  get direction(): FiscalDocumentDirection { return this.props.direction; }
  get environment(): FiscalNfseEnvironment { return this.props.environment; }
  get status(): FiscalNfseDocumentStatus { return this.props.status; }
  get model(): string { return this.props.model; }
  get series(): number { return this.props.series; }
  get number(): number { return this.props.number; }
  get accessKey(): string | null | undefined { return this.props.accessKey; }
  get issuerCnpj(): string { return this.props.issuerCnpj; }
  get recipientDocument(): string | null | undefined { return this.props.recipientDocument; }
  get recipientName(): string | null | undefined { return this.props.recipientName; }
  get totalAmount(): string | null | undefined { return this.props.totalAmount; }
  get issuedAt(): Date | null | undefined { return this.props.issuedAt; }
  get authorizedAt(): Date | null | undefined { return this.props.authorizedAt; }
  get cancelledAt(): Date | null | undefined { return this.props.cancelledAt; }
  get authorizationProtocol(): string | null | undefined { return this.props.authorizationProtocol; }
  get cancellationProtocol(): string | null | undefined { return this.props.cancellationProtocol; }
  get prefeituraStatusCode(): string | null | undefined { return this.props.prefeituraStatusCode; }
  get prefeituraStatusMessage(): string | null | undefined { return this.props.prefeituraStatusMessage; }
  get sapDocumentId(): string | null | undefined { return this.props.sapDocumentId; }
  get sapOrderId(): string | null | undefined { return this.props.sapOrderId; }
  get idempotencyKey(): string | null | undefined { return this.props.idempotencyKey; }
  get metadata(): Record<string, unknown> | null | undefined { return this.props.metadata; }
  get rpsNumber(): number | null | undefined { return this.props.rpsNumber; }
  get rpsSeries(): string | null | undefined { return this.props.rpsSeries; }
  get verificationCode(): string | null | undefined { return this.props.verificationCode; }
  get serviceCode(): string | null | undefined { return this.props.serviceCode; }
  get municipalityCode(): string | null | undefined { return this.props.municipalityCode; }
  get issRetained(): boolean | null | undefined { return this.props.issRetained; }
  get serviceDescription(): string | null | undefined { return this.props.serviceDescription; }

  withStatus(status: FiscalNfseDocumentStatus, accessKey?: string | null): NfseDocument {
    return new NfseDocument({ ...this.props, status, accessKey: accessKey ?? this.accessKey ?? null, updatedAt: new Date() });
  }

  validate(): void {
    Validator.validate([
      { code: 'nfse-document.organizationId', value: this.organizationId, rules: [new RequiredRule()] },
      { code: 'nfse-document.companyId', value: this.companyId, rules: [new RequiredRule()] },
      { code: 'nfse-document.direction', value: this.direction, rules: [new RequiredRule(), new InRule([...FISCAL_DOCUMENT_DIRECTIONS])] },
      { code: 'nfse-document.environment', value: this.environment, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_ENVIRONMENTS])] },
      { code: 'nfse-document.status', value: this.status, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_DOCUMENT_STATUSES])] },
      { code: 'nfse-document.issuerCnpj', value: this.issuerCnpj, rules: [new RequiredRule(), new CnpjRule()] },
    ]);
  }
}
