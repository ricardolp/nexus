import { FiscalNfsePedidoValidationStatus, FISCAL_NFSE_PEDIDO_VALIDATION_STATUSES } from '../../shared/fiscal-nfse-pedido-validation-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfseDocumentItemState extends EntityState {
  documentId: string;
  lineNumber: number;
  prodCodigo: string;
  descricao: string;
  serviceCode: string;
  municipalityCode: string;
  qty: string;
  uom: string;
  valorTotal: string;
  xPed?: string | null;
  nItemPed?: string | null;
  pedidoValidationStatus: FiscalNfsePedidoValidationStatus;
  pedidoValidationMessage?: string | null;
  sapOrderNumber?: string | null;
  sapOrderItem?: string | null;
}

export class NfseDocumentItem extends Entity<NfseDocumentItemState> {
  constructor(props: NfseDocumentItemState) {
    super(props);
  }

  get documentId(): string {
    return this.props.documentId;
  }

  get lineNumber(): number {
    return this.props.lineNumber;
  }

  get prodCodigo(): string {
    return this.props.prodCodigo;
  }

  get descricao(): string {
    return this.props.descricao;
  }

  get serviceCode(): string {
    return this.props.serviceCode;
  }

  get municipalityCode(): string {
    return this.props.municipalityCode;
  }

  get qty(): string {
    return this.props.qty;
  }

  get uom(): string {
    return this.props.uom;
  }

  get valorTotal(): string {
    return this.props.valorTotal;
  }

  get xPed(): string | null | undefined {
    return this.props.xPed;
  }

  get nItemPed(): string | null | undefined {
    return this.props.nItemPed;
  }

  get pedidoValidationStatus(): FiscalNfsePedidoValidationStatus {
    return this.props.pedidoValidationStatus;
  }

  get pedidoValidationMessage(): string | null | undefined {
    return this.props.pedidoValidationMessage;
  }

  get sapOrderNumber(): string | null | undefined {
    return this.props.sapOrderNumber;
  }

  get sapOrderItem(): string | null | undefined {
    return this.props.sapOrderItem;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfse-document-item.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-item.lineNumber',
        value: this.lineNumber,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-item.prodCodigo',
        value: this.prodCodigo,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-item.descricao',
        value: this.descricao,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-item.qty',
        value: this.qty,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-item.valorTotal',
        value: this.valorTotal,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfse-document-item.pedidoValidationStatus',
        value: this.pedidoValidationStatus,
        rules: [
          new RequiredRule(),
          new InRule([...FISCAL_NFSE_PEDIDO_VALIDATION_STATUSES]),
        ],
      },
    ]);
  }
}
