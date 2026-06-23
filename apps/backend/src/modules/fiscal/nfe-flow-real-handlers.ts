import { Injectable } from '@nestjs/common';
import {
  BaseSimulatedStepHandler,
  NfeFlowStepHandler,
  NfeFlowStepHandlerContext,
  NfeFlowStepHandlerResult,
  parseValidationStepConfig,
} from '@nexus/fiscal';
import { NfeInboundService } from './nfe-inbound.service';

@Injectable()
export class RealFetchPurchaseOrdersHandler
  extends BaseSimulatedStepHandler
  implements NfeFlowStepHandler
{
  readonly stepKey = 'FETCH_PURCHASE_ORDERS';

  constructor(private readonly inboundService: NfeInboundService) {
    super();
  }

  protected override async executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult> {
    const result = await this.inboundService.runPedidoValidation(ctx.documentId);
    return {
      status: result.matched ? 'success' : 'error',
      message: result.matched
        ? `Pedido ${result.primaryOrder ?? ''} validado.`
        : 'Validação de pedido não concluída.',
      payload: { lines: result.lines },
    };
  }
}

@Injectable()
export class RealValidationsHandler
  extends BaseSimulatedStepHandler
  implements NfeFlowStepHandler
{
  readonly stepKey = 'VALIDATIONS';

  constructor(private readonly inboundService: NfeInboundService) {
    super();
  }

  protected override async executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult> {
    const config = parseValidationStepConfig(ctx.step.config);
    const result = await this.inboundService.runBusinessValidations(
      ctx.documentId,
      config,
    );

    return {
      status: result.passed ? 'success' : 'error',
      message: result.passed
        ? 'Validações de negócio concluídas.'
        : result.issues[0]?.message ?? 'Divergência entre XML e pedido SAP.',
      payload: { issues: result.issues },
    };
  }
}

@Injectable()
export class RealCreateDeliveryHandler
  extends BaseSimulatedStepHandler
  implements NfeFlowStepHandler
{
  readonly stepKey = 'CREATE_DELIVERY';

  constructor(private readonly inboundService: NfeInboundService) {
    super();
  }

  protected override async executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult> {
    const result = await this.inboundService.runCreateDelivery(ctx.documentId);
    return {
      status: 'waiting_external_status',
      message: `Delivery ${result.deliveryNumber} criada. Aguardando portaria.`,
      payload: { deliveryNumber: result.deliveryNumber },
    };
  }
}

@Injectable()
export class RealWaitGateStatusHandler
  extends BaseSimulatedStepHandler
  implements NfeFlowStepHandler
{
  readonly stepKey = 'WAIT_GATE_STATUS';

  protected override async executeReal(
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

@Injectable()
export class RealPostMigoHandler
  extends BaseSimulatedStepHandler
  implements NfeFlowStepHandler
{
  readonly stepKey = 'POST_MIGO';

  protected override async executeReal(): Promise<NfeFlowStepHandlerResult> {
    return {
      status: 'waiting_external_status',
      message: 'Aguardando registro de MIGO.',
    };
  }
}

@Injectable()
export class RealCreateInvoiceHandler
  extends BaseSimulatedStepHandler
  implements NfeFlowStepHandler
{
  readonly stepKey = 'CREATE_INVOICE';

  constructor(private readonly inboundService: NfeInboundService) {
    super();
  }

  protected override async executeReal(
    ctx: NfeFlowStepHandlerContext,
  ): Promise<NfeFlowStepHandlerResult> {
    const result = await this.inboundService.runMiro(ctx.documentId);
    if (!result.processed) {
      return {
        status: 'error',
        message:
          result.skippedReason === 'invalid_status'
            ? 'MIRO não executada: aguardando conclusão do MIGO.'
            : 'MIRO não processada.',
        payload: { skippedReason: result.skippedReason },
      };
    }
    return {
      status: 'success',
      message: `MIRO ${result.miroNumber} processada.`,
      payload: { miroNumber: result.miroNumber },
    };
  }
}

export function createRealFlowHandlers(handlers: {
  fetchPurchaseOrders: RealFetchPurchaseOrdersHandler;
  validations: RealValidationsHandler;
  createDelivery: RealCreateDeliveryHandler;
  waitGate: RealWaitGateStatusHandler;
  postMigo: RealPostMigoHandler;
  createInvoice: RealCreateInvoiceHandler;
}): NfeFlowStepHandler[] {
  return [
    handlers.fetchPurchaseOrders,
    handlers.validations,
    handlers.createDelivery,
    handlers.waitGate,
    handlers.postMigo,
    handlers.createInvoice,
  ];
}
