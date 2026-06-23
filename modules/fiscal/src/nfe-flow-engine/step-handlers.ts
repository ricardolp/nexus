import type { FiscalNfeFlowStepKey } from '../shared/fiscal-nfe-flow-step-key';
import type { FiscalNfeFlowStepExecutionStatus } from '../shared/fiscal-nfe-flow-step-execution-status';
import { NfeFlowStep } from '../nfe-flow-config/model';

export interface NfeFlowStepHandlerContext {
  documentId: string;
  step: NfeFlowStep;
  dryRun?: boolean;
  accessKey?: string;
  purchaseOrder?: string;
}

export interface NfeFlowStepHandlerResult {
  status: FiscalNfeFlowStepExecutionStatus;
  message: string;
  payload?: Record<string, unknown>;
}

export interface NfeFlowStepHandler {
  readonly stepKey: FiscalNfeFlowStepKey | string;
  execute(ctx: NfeFlowStepHandlerContext): Promise<NfeFlowStepHandlerResult>;
}

export abstract class BaseSimulatedStepHandler implements NfeFlowStepHandler {
  abstract readonly stepKey: FiscalNfeFlowStepKey | string;

  async execute(ctx: NfeFlowStepHandlerContext): Promise<NfeFlowStepHandlerResult> {
    if (ctx.dryRun) {
      return {
        status: 'success',
        message: `${ctx.step.name} executado em modo simulado.`,
      };
    }
    return this.executeReal(ctx);
  }

  protected abstract executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult>;
}

export class FetchPurchaseOrdersHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'FETCH_PURCHASE_ORDERS';

  protected async executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'success',
      message: ctx.purchaseOrder
        ? `Pedido ${ctx.purchaseOrder} localizado.`
        : 'Pedidos localizados pelo XML.',
    };
  }
}

export class ValidationsHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'VALIDATIONS';

  protected async executeReal(): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'success',
      message: 'Todas as validações foram concluídas.',
    };
  }
}

export class CreateDeliveryHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'CREATE_DELIVERY';

  protected async executeReal(): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'success',
      message: 'Delivery criado com sucesso.',
    };
  }
}

export class WaitGateStatusHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'WAIT_GATE_STATUS';

  protected async executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult> {
    const expected = ctx.step.config.expectedStatus ?? 'EM_PORTARIA';
    return {
      status: 'waiting_external_status',
      message: `Aguardando status ${expected}.`,
      payload: { expectedStatus: expected },
    };
  }
}

export class PostMigoHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'POST_MIGO';

  protected async executeReal(): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'success',
      message: 'MIGO lançada com sucesso.',
    };
  }
}

export class CreateInvoiceHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'CREATE_INVOICE';

  protected async executeReal(): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'success',
      message: 'Fatura criada com sucesso.',
    };
  }
}

export class NotifyErrorHandler extends BaseSimulatedStepHandler {
  readonly stepKey = 'NOTIFY_ERROR';

  protected async executeReal(): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'error',
      message: 'Processo bloqueado e responsável notificado.',
    };
  }
}

export function createDefaultStepHandlers(): NfeFlowStepHandler[] {
  return [
    new FetchPurchaseOrdersHandler(),
    new ValidationsHandler(),
    new CreateDeliveryHandler(),
    new WaitGateStatusHandler(),
    new PostMigoHandler(),
    new CreateInvoiceHandler(),
    new NotifyErrorHandler(),
  ];
}
