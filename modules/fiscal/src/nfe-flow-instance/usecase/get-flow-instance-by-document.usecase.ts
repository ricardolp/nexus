import { NotFoundError, UseCase } from '@nexus/shared';
import { NfeFlowInstanceRepository } from '../provider';

export interface GetFlowInstanceByDocumentIn {
  documentId: string;
}

export class GetFlowInstanceByDocument
  implements
    UseCase<
      GetFlowInstanceByDocumentIn,
      Awaited<ReturnType<NfeFlowInstanceRepository['findByDocumentId']>>
    >
{
  constructor(private readonly repository: NfeFlowInstanceRepository) {}

  async execute(input: GetFlowInstanceByDocumentIn) {
    const full = await this.repository.findByDocumentId(input.documentId);
    if (!full) {
      throw new NotFoundError('Instância de fluxo não encontrada.');
    }
    return full;
  }
}
