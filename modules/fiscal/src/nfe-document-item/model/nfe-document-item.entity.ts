import { FiscalNfePedidoValidationStatus, FISCAL_NFE_PEDIDO_VALIDATION_STATUSES } from '../../shared/fiscal-nfe-pedido-validation-status';
import { Entity, EntityState, InRule, RequiredRule, Validator } from '@nexus/shared';

export interface NfeDocumentItemState extends EntityState {
  documentId: string;
  lineNumber: number;
  prodCodigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  qty: string;
  uom: string;
  valorTotal: string;
  xPed?: string | null;
  nItemPed?: string | null;
  pedidoValidationStatus: FiscalNfePedidoValidationStatus;
  pedidoValidationMessage?: string | null;
  sapOrderNumber?: string | null;
  sapOrderItem?: string | null;
}

export class NfeDocumentItem extends Entity<NfeDocumentItemState> {
  constructor(props: NfeDocumentItemState) {
    super(props);
  }

  get documentId() {
    return this.props.documentId;
  }

  get lineNumber() {
    return this.props.lineNumber;
  }

  get prodCodigo() {
    return this.props.prodCodigo;
  }

  get descricao() {
    return this.props.descricao;
  }

  get ncm() {
    return this.props.ncm;
  }

  get cfop() {
    return this.props.cfop;
  }

  get qty() {
    return this.props.qty;
  }

  get uom() {
    return this.props.uom;
  }

  get valorTotal() {
    return this.props.valorTotal;
  }

  get xPed() {
    return this.props.xPed;
  }

  get nItemPed() {
    return this.props.nItemPed;
  }

  get pedidoValidationStatus() {
    return this.props.pedidoValidationStatus;
  }

  get pedidoValidationMessage() {
    return this.props.pedidoValidationMessage;
  }

  get sapOrderNumber() {
    return this.props.sapOrderNumber;
  }

  get sapOrderItem() {
    return this.props.sapOrderItem;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'nfe-document-item.documentId',
        value: this.documentId,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-item.lineNumber',
        value: this.lineNumber,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-item.prodCodigo',
        value: this.prodCodigo,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-item.descricao',
        value: this.descricao,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-item.qty',
        value: this.qty,
        rules: [new RequiredRule()],
      },
      {
        code: 'nfe-document-item.valorTotal',
        value: this.valorTotal,
        rules: [new RequiredRule()],
      },
      { code: 'nfe-document-item.pedidoValidationStatus', value: this.pedidoValidationStatus, rules: [new RequiredRule(), new InRule([...FISCAL_NFE_PEDIDO_VALIDATION_STATUSES])] },
    ]);
  }
}
