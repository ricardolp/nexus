import { NotFoundError, UseCase } from '@nexus/shared';
import type { FiscalNfeFlowStepExecutionStatus } from '../../shared/fiscal-nfe-flow-step-execution-status';
import { NfeFlowConfigRepository } from '../provider';

export interface TestFlowConfigIn {
  configId: string;
  accessKey?: string;
  purchaseOrder?: string;
}

export interface TestFlowStepResult {
  step: string;
  status: FiscalNfeFlowStepExecutionStatus;
  message: string;
}

export interface TestFlowConfigOut {
  success: boolean;
  steps: TestFlowStepResult[];
}

export class TestFlowConfig
  implements UseCase<TestFlowConfigIn, TestFlowConfigOut>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  async execute(input: TestFlowConfigIn): Promise<TestFlowConfigOut> {
    const full = await this.repository.findFullById(input.configId);
    if (!full) {
      throw new NotFoundError('Configuração de fluxo não encontrada.');
    }

    const activeSteps = full.steps
      .filter((s) => s.active)
      .sort((a, b) => a.sequence - b.sequence);

    const results: TestFlowStepResult[] = activeSteps.map((step) => ({
      step: step.stepKey,
      status: 'success' as const,
      message: simulateStepMessage(step.stepKey, input),
    }));

    return {
      success: results.every((r) => r.status === 'success'),
      steps: results,
    };
  }
}

function simulateStepMessage(
  stepKey: string,
  input: TestFlowConfigIn,
): string {
  switch (stepKey) {
    case 'FETCH_PURCHASE_ORDERS':
      return input.purchaseOrder
        ? `Pedido ${input.purchaseOrder} encontrado (simulado).`
        : 'Busca de pedidos simulada com sucesso.';
    case 'VALIDATIONS':
      return 'Todas as validações foram concluídas (simulado).';
    case 'CREATE_DELIVERY':
      return 'Delivery criado com sucesso (simulado).';
    case 'WAIT_GATE_STATUS':
      return 'Status de portaria OK (simulado).';
    case 'POST_MIGO':
      return 'MIGO lançada com sucesso (simulado).';
    case 'CREATE_INVOICE':
      return 'Fatura criada com sucesso (simulado).';
    case 'NOTIFY_ERROR':
      return 'Notificação de erro configurada (simulado).';
    default:
      return `Etapa ${stepKey} executada (simulado).`;
  }
}
