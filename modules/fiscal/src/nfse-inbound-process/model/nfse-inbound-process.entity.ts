import { FiscalNfseInboundStatus, FISCAL_NFSE_INBOUND_STATUSES } from '../../shared/fiscal-nfse-inbound-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseInboundProcessState extends EntityState {
  documentId: string;
  inboundStatus: FiscalNfseInboundStatus;
  statusChangedAt: Date;
  prefeituraValidatedAt?: Date | null;
  pedidoValidatedAt?: Date | null;
  deliveryCreatedAt?: Date | null;
  portariaConfirmedAt?: Date | null;
  portariaConfirmedByUserId?: string | null;
  migoCompletedAt?: Date | null;
  miroCompletedAt?: Date | null;
  rejectedAt?: Date | null;
  rejectedByUserId?: string | null;
  rejectionReason?: string | null;
  alertCode?: string | null;
  alertMessage?: string | null;
  correlationId?: string | null;
}

export class NfseInboundProcess extends Entity<NfseInboundProcessState> {
  constructor(props: NfseInboundProcessState) {
    super(props);
  }

  get documentId() {
    return this.props.documentId;
  }

  get inboundStatus() {
    return this.props.inboundStatus;
  }

  get statusChangedAt() {
    return this.props.statusChangedAt;
  }

  get prefeituraValidatedAt() {
    return this.props.prefeituraValidatedAt;
  }

  get pedidoValidatedAt() {
    return this.props.pedidoValidatedAt;
  }

  get deliveryCreatedAt() {
    return this.props.deliveryCreatedAt;
  }

  get portariaConfirmedAt() {
    return this.props.portariaConfirmedAt;
  }

  get portariaConfirmedByUserId() {
    return this.props.portariaConfirmedByUserId;
  }

  get migoCompletedAt() {
    return this.props.migoCompletedAt;
  }

  get miroCompletedAt() {
    return this.props.miroCompletedAt;
  }

  get rejectedAt() {
    return this.props.rejectedAt;
  }

  get rejectedByUserId() {
    return this.props.rejectedByUserId;
  }

  get rejectionReason() {
    return this.props.rejectionReason;
  }

  get alertCode() {
    return this.props.alertCode;
  }

  get alertMessage() {
    return this.props.alertMessage;
  }

  get correlationId() {
    return this.props.correlationId;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfse-inbound-process.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-inbound-process.inboundStatus',
        value: this.inboundStatus,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-inbound-process.statusChangedAt',
        value: this.statusChangedAt,
        rules: [new RequiredRule()],
      },
      { code: 'nfse-inbound-process.inboundStatus', value: this.inboundStatus, rules: [new RequiredRule(), new InRule([...FISCAL_NFSE_INBOUND_STATUSES])] },
    ]);
  }
}
