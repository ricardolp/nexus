export const SAP_INBOUND_MIRO_DOCUMENT = "MIRO";
export const SAP_INBOUND_MIRO_DOC_TYPE = "RE";
export const SAP_INBOUND_MIRO_CURRENCY = "BRL";

/** Matches ABAP ty_nf_header */
export type SapInboundMiroHeader = {
  company_code: string;
  doc_type: string;
  doc_date: string;
  posting_date: string;
  reference: string;
  gross_amount: number;
  currency: string;
  calc_tax: boolean;
  header_text: string;
  payment_terms: string;
  baseline_date: string;
  partner_bank: string;
  invoice_ind: boolean;
  simulate: boolean;
};

/** Matches ABAP ty_nf_item */
export type SapInboundMiroItem = {
  po_number: string;
  po_item: string;
  nf_item: string;
  quantity: number;
  item_amount: number;
  tax_code: string;
  po_unit: string;
};

export type SapInboundMiroRequest = {
  document: typeof SAP_INBOUND_MIRO_DOCUMENT;
  protocoloConsulta: string;
  header: SapInboundMiroHeader;
  items: SapInboundMiroItem[];
};

export type SapInboundMiroResponse = {
  erros?: unknown[];
  ERROS?: unknown[];
  return?: unknown[];
  RETURN?: unknown[];
  message?: unknown[];
  MESSAGE?: unknown[];
  RS_RESULT?: Record<string, unknown>;
  rs_result?: Record<string, unknown>;
  invoiceDocNumber?: string | number;
  INVOICEDOCNUMBER?: string | number;
  invoicedocument?: string;
  INVOICEDOCUMENT?: string;
  invoiceDocument?: string;
  miroNumber?: string;
  MIRONUMBER?: string;
  accountingdocument?: string;
  accountingDocument?: string;
  ACCOUNTINGDOCUMENT?: string;
  fiscalyear?: string | number;
  fiscalYear?: string | number;
  FISCALYEAR?: string | number;
  [key: string]: unknown;
};
