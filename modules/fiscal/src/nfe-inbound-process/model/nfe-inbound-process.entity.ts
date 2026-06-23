import { FiscalNfeInboundStatus, FISCAL_NFE_INBOUND_STATUSES } from '../../shared/fiscal-nfe-inbound-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeInboundProcessState extends EntityState {
  documentId: string;
  inboundStatus: FiscalNfeInboundStatus;
  statusChangedAt: Date;
  sefazValidatedAt?: Date | null;
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

export class NfeInboundProcess extends Entity<NfeInboundProcessState> {
  constructor(props: NfeInboundProcessState) {
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

  get sefazValidatedAt() {
    return this.props.sefazValidatedAt;
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
        code: 'nfe-inbound-process.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-inbound-process.inboundStatus',
        value: this.inboundStatus,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-inbound-process.statusChangedAt',
        value: this.statusChangedAt,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-inbound-process.inboundStatus', value: this.inboundStatus, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_INBOUND_STATUSES])] },
    ]);
  }
}
