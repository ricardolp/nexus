import type { FiscalNfeInboundStatus } from '../shared/fiscal-nfe-inbound-status';
import type { FiscalNfeFlowStepKey } from '../shared/fiscal-nfe-flow-step-key';
import type { FiscalNfeFlowStepExecutionStatus } from '../shared/fiscal-nfe-flow-step-execution-status';

export const STEP_KEY_TO_INBOUND_STATUS: Partial<
  Record<FiscalNfeFlowStepKey, FiscalNfeInboundStatus>
> = {
  FETCH_PURCHASE_ORDERS: 'pedido_validating',
  VALIDATIONS: 'pedido_matched',
  CREATE_DELIVERY: 'delivery_creating',
  WAIT_GATE_STATUS: 'awaiting_portaria',
  POST_MIGO: 'migo_pending',
  CREATE_INVOICE: 'miro_pending',
  NOTIFY_ERROR: 'inbound_error',
};

export const STEP_KEY_SUCCESS_INBOUND_STATUS: Partial<
  Record<FiscalNfeFlowStepKey, FiscalNfeInboundStatus>
> = {
  FETCH_PURCHASE_ORDERS: 'pedido_matched',
  VALIDATIONS: 'pedido_matched',
  CREATE_DELIVERY: 'delivery_created',
  WAIT_GATE_STATUS: 'migo_pending',
  POST_MIGO: 'migo_done',
  CREATE_INVOICE: 'miro_done',
};

export const EXECUTION_STATUS_TO_INSTANCE_STATUS: Record<
  FiscalNfeFlowStepExecutionStatus,
  string
> = {
  pending: 'ready',
  running: 'processing',
  success: 'processing',
  error: 'error',
  skipped: 'processing',
  disabled: 'processing',
  waiting_external_status: 'waiting_gate',
};
