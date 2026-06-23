export type SapPedidoCompraImposto = {
  tipo: string;
  condicaoAliquota?: string;
  condicaoValor?: string;
  grupoImposto?: string;
  baseNormal?: number;
  baseOutras?: number;
  aliquota?: number;
  valor?: number;
  percentualReducao?: number;
};

export type SapPedidoCompraLine = {
  PEDIDO: string;
  APROVACAO_NEC?: string;
  FLUXO_RECEBIMENTO_NEC?: string;
  ITEM: number;
  COD_SERV: string;
  CUSTO_COMPLEMENTAR?: string;
  NUM_SERIE_OBRIG?: string;
  LOTE_OBRIG?: string;
  DESCR_SERV: string;
  DATA_CRIACAO?: string;
  UNIDADE?: string;
  VALOR_BRUTO?: number;
  VAL_UNIT?: number;
  QTD_DISPONIVEL?: number;
  VAL_DISPONIVEL?: number;
  REQ_COMPRA?: string;
  ITEM_REQ_COMPRA?: number;
  CENTRO?: string;
  DEPOSITO?: string;
  EMPRESA?: string;
  TIPO_PEDIDO?: string;
  ORGANIZACAO_COMPRAS?: string;
  GRUPO_COMPRAS?: string;
  FORNECEDOR?: string;
  NOME_FORNECEDOR?: string;
  MOEDA?: string;
  CONDICAO_PAGAMENTO?: string;
  CRIADO_POR?: string;
  IMPOSTOS?: SapPedidoCompraImposto[];
};

export type SapPurchaseOrderHeader = {
  pedido: string;
  empresa?: string;
  tipoPedido?: string;
  dataCriacao?: string;
  organizacaoCompras?: string;
  grupoCompras?: string;
  fornecedor?: string;
  nomeFornecedor?: string;
  moeda?: string;
  condicaoPagamento?: string;
  criadoPor?: string;
};

export type SapPurchaseOrderItem = {
  item: number;
  material: string;
  descricao: string;
  centro?: string;
  deposito?: string;
  unidade?: string;
  quantidade?: number;
  valorBruto?: number;
  valorLiquido?: number;
  valorUnitario?: number;
  fluxoRecebimentoNec?: string;
  impostos?: SapPedidoCompraImposto[];
};

export type SapPurchaseOrder = {
  cabecalho: SapPurchaseOrderHeader;
  itens: SapPurchaseOrderItem[];
};

/** CPI response with header fields at the root (no cabecalho wrapper). */
export type SapFlatPurchaseOrder = SapPurchaseOrderHeader & {
  itens: SapPurchaseOrderItem[];
};

export type SapPurchaseOrderInput = SapPurchaseOrder | SapFlatPurchaseOrder;

export type SapPurchaseOrdersEnvelope = {
  pedidos?: SapPurchaseOrderInput[];
  PEDIDOSCOMPRA?: SapPedidoCompraLine[];
  PROGRAMASREMESSA?: unknown[];
  ESTOQUE_NO_FORNECEDOR?: unknown[];
  MESSAGE?: unknown[];
};

/** Raw CPI/SAP response (array, envelope, or legacy flat format). */
export type SapPurchaseOrdersRawResponse =
  | SapPurchaseOrdersEnvelope
  | SapPurchaseOrderInput[];

export type SapPurchaseOrdersResponse = {
  PEDIDOSCOMPRA: SapPedidoCompraLine[];
  PROGRAMASREMESSA?: unknown[];
  ESTOQUE_NO_FORNECEDOR?: unknown[];
  MESSAGE?: unknown[];
};

export type FetchPurchaseOrdersParams = {
  issuerCnpj: string;
  branchCnpj: string;
  issuedAt: Date;
  sapClient: string;
  sapLanguage: string;
};
