// Client-side mirror of backend/internal/inbound/templates.go's fixed
// catalog — it's Go-side code, not a database table (declarative per-tenant
// authoring is future work per that file's comment), so this list must be
// kept in sync by hand if the backend catalog ever changes.

export interface ProcessTemplateOption {
  code: string;
  label: string;
  description: string;
  steps: string[];
}

export const PROCESS_TEMPLATES: ProcessTemplateOption[] = [
  {
    code: 'STANDARD_PURCHASE',
    label: 'Compra padrão',
    description: 'Pedido → Recebimento (MIGO) → Fatura (MIRO)',
    steps: ['CREATE_PURCHASE_ORDER', 'POST_GOODS_RECEIPT', 'POST_SUPPLIER_INVOICE']
  },
  {
    code: 'EWM_PURCHASE',
    label: 'Compra com EWM',
    description: 'Pedido → Entrega de entrada → Recebimento (MIGO) → Fatura (MIRO)',
    steps: [
      'CREATE_PURCHASE_ORDER',
      'CREATE_INBOUND_DELIVERY',
      'POST_GOODS_RECEIPT',
      'POST_SUPPLIER_INVOICE'
    ]
  },
  {
    code: 'DIRECT_GR',
    label: 'Recebimento direto',
    description: 'Pedido → Recebimento (MIGO) → Fatura (MIRO), sem entrega de entrada',
    steps: ['CREATE_PURCHASE_ORDER', 'POST_GOODS_RECEIPT', 'POST_SUPPLIER_INVOICE']
  },
  {
    code: 'SERVICE',
    label: 'Serviço',
    description: 'Pedido → Folha de entrada de serviço → Fatura (MIRO)',
    steps: ['CREATE_PURCHASE_ORDER', 'CREATE_SERVICE_ENTRY', 'POST_SUPPLIER_INVOICE']
  },
  {
    code: 'FI_ONLY',
    label: 'Somente contábil',
    description: 'Lançamento contábil direto, sem pedido de compra',
    steps: ['POST_ACCOUNTING_DOCUMENT']
  }
];

export const PO_REFERENCE_POLICIES = [
  { value: 'REQUIRED', label: 'Obrigatória' },
  { value: 'OPTIONAL', label: 'Opcional' },
  { value: 'IGNORE', label: 'Ignorar' }
];

export const PO_REFERENCE_LEVELS = [
  { value: 'DOCUMENT', label: 'No cabeçalho do documento' },
  { value: 'ITEM', label: 'No item' },
  { value: 'DOCUMENT_OR_ITEM', label: 'No cabeçalho ou no item' }
];

export const PO_MISSING_ACTIONS = [
  { value: 'REJECT', label: 'Rejeitar documento' },
  { value: 'WAIT_USER', label: 'Aguardar decisão manual' },
  { value: 'SEARCH_SAP', label: 'Buscar no SAP' },
  { value: 'CREATE_PO', label: 'Criar pedido' },
  { value: 'CONTINUE_WITHOUT_PO', label: 'Continuar sem pedido' }
];

export const PO_RESOLUTION_MODES = [
  { value: 'REQUIRED_EXISTING', label: 'Exigir pedido existente' },
  { value: 'FIND_EXISTING', label: 'Buscar pedido existente' },
  { value: 'FIND_OR_CREATE', label: 'Buscar ou criar' },
  { value: 'MANUAL_SELECTION', label: 'Seleção manual' },
  { value: 'CREATE', label: 'Sempre criar' },
  { value: 'OPTIONAL', label: 'Opcional' },
  { value: 'NONE', label: 'Nenhum' }
];

export const PO_NOT_FOUND_ACTIONS = [
  { value: 'REJECT', label: 'Rejeitar documento' },
  { value: 'WAIT_USER', label: 'Aguardar decisão manual' },
  { value: 'CREATE_PO', label: 'Criar pedido' },
  { value: 'SEARCH_ALTERNATIVE', label: 'Buscar alternativa' }
];

export const FAILURE_ACTIONS = [
  { value: 'PASS', label: 'Ignorar e seguir' },
  { value: 'WARN', label: 'Avisar e seguir' },
  { value: 'BLOCK', label: 'Bloquear documento' },
  { value: 'WAIT_USER', label: 'Aguardar decisão manual' },
  { value: 'REJECT', label: 'Rejeitar documento' }
];

export const STEP_MODES = [
  { value: 'DISABLED', label: 'Desabilitado' },
  { value: 'AUTO', label: 'Automático' },
  { value: 'MANUAL', label: 'Manual' }
];

export const DEFAULT_SCENARIO_RULE = {
  po_reference_policy: 'REQUIRED',
  po_reference_level: 'DOCUMENT_OR_ITEM',
  po_missing_action: 'WAIT_USER',
  po_resolution_mode: 'FIND_EXISTING',
  po_not_found_action: 'WAIT_USER',
  validate_vendor: true,
  vendor_failure_action: 'WAIT_USER',
  vendor_override_allowed: true,
  validate_material: true,
  material_failure_action: 'WAIT_USER',
  material_override_allowed: true,
  validate_quantity: true,
  quantity_tolerance_percent: 5,
  validate_price: true,
  price_tolerance_percent: 5,
  validate_tax: false,
  tax_failure_action: 'PASS',
  receipt_mode: 'INBOUND_DELIVERY',
  inbound_delivery_mode: 'AUTO',
  goods_receipt_mode: 'AUTO',
  goods_receipt_movement_type: '101',
  supplier_invoice_mode: 'AUTO',
  notify_on_reject: false,
  create_occurrence_on_reject: false,
  notify_vendor_on_reject: false,
  sefaz_event_on_reject: false,
  responsible_emails: [] as string[]
};
