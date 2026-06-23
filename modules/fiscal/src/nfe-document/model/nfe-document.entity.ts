import {
  CnpjRule,
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import {
  FiscalDocumentDirection,
  FISCAL_DOCUMENT_DIRECTIONS,
} from '../../shared/fiscal-document-direction';
import {
  FiscalNfeEnvironment,
  FISCAL_NFE_ENVIRONMENTS,
} from '../../shared/fiscal-nfe-environment';
import {
  FiscalNfeDocumentStatus,
  FISCAL_NFE_DOCUMENT_STATUSES,
} from '../../shared/fiscal-nfe-document-status';

export interface NfeDocumentState extends EntityState {
  organizationId: string;
  companyId: string;
  direction: FiscalDocumentDirection;
  environment: FiscalNfeEnvironment;
  status: FiscalNfeDocumentStatus;
  model: string;
  series: number;
  number: number;
  accessKey?: string | null;
  issuerCnpj: string;
  issuerName?: string | null;
  recipientDocument?: string | null;
  recipientName?: string | null;
  totalAmount?: string | null;
  issuedAt?: Date | null;
  authorizedAt?: Date | null;
  cancelledAt?: Date | null;
  authorizationProtocol?: string | null;
  cancellationProtocol?: string | null;
  sefazStatusCode?: string | null;
  sefazStatusMessage?: string | null;
  sapDocumentId?: string | null;
  sapOrderId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class NfeDocument extends Entity<NfeDocumentState> {
  constructor(props: NfeDocumentState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get companyId(): string {
    return this.props.companyId;
  }

  get direction(): FiscalDocumentDirection {
    return this.props.direction;
  }

  get environment(): FiscalNfeEnvironment {
    return this.props.environment;
  }

  get status(): FiscalNfeDocumentStatus {
    return this.props.status;
  }

  get model(): string {
    return this.props.model;
  }

  get series(): number {
    return this.props.series;
  }

  get number(): number {
    return this.props.number;
  }

  get accessKey(): string | null | undefined {
    return this.props.accessKey;
  }

  get issuerCnpj(): string {
    return this.props.issuerCnpj;
  }

  get issuerName(): string | null | undefined {
    return this.props.issuerName;
  }

  get recipientDocument(): string | null | undefined {
    return this.props.recipientDocument;
  }

  get recipientName(): string | null | undefined {
    return this.props.recipientName;
  }

  get totalAmount(): string | null | undefined {
    return this.props.totalAmount;
  }

  get issuedAt(): Date | null | undefined {
    return this.props.issuedAt;
  }

  get authorizedAt(): Date | null | undefined {
    return this.props.authorizedAt;
  }

  get cancelledAt(): Date | null | undefined {
    return this.props.cancelledAt;
  }

  get authorizationProtocol(): string | null | undefined {
    return this.props.authorizationProtocol;
  }

  get cancellationProtocol(): string | null | undefined {
    return this.props.cancellationProtocol;
  }

  get sefazStatusCode(): string | null | undefined {
    return this.props.sefazStatusCode;
  }

  get sefazStatusMessage(): string | null | undefined {
    return this.props.sefazStatusMessage;
  }

  get sapDocumentId(): string | null | undefined {
    return this.props.sapDocumentId;
  }

  get sapOrderId(): string | null | undefined {
    return this.props.sapOrderId;
  }

  get idempotencyKey(): string | null | undefined {
    return this.props.idempotencyKey;
  }

  get metadata(): Record<string, unknown> | null | undefined {
    return this.props.metadata;
  }

  withStatus(
    status: FiscalNfeDocumentStatus,
    accessKey?: string | null,
  ): NfeDocument {
    return new NfeDocument({
      ...this.props,
      status,
      accessKey: accessKey ?? this.accessKey ?? null,
      updatedAt: new Date(),
    });
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-document.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document.companyId',
        value: this.companyId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document.direction',
        value: this.direction,
        rules: [new RequiredRule(), new InRule([...FISCAL_DOCUMENT_DIRECTIONS])],
      },
      {
        code: 'nfe-document.environment',
        value: this.environment,
        rules: [new RequiredRule(), new InRule([...FISCAL_NFE_ENVIRONMENTS])],
      },
      {
        code: 'nfe-document.status',
        value: this.status,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFE_DOCUMENT_STATUSES]),
        ],
      },
      {
        code: 'nfe-document.issuerCnpj',
        value: this.issuerCnpj,
        rules: [new RequiredRule(), new CnpjRule()],
      },
    ]);
  }
}
