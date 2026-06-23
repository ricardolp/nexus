import { UseCase } from '@nexus/shared';
import { FiscalDocumentDirection } from '../../shared/fiscal-document-direction';
import { FiscalNfeEnvironment } from '../../shared/fiscal-nfe-environment';
import { NfeDocument } from '../model';
import { NfeDocumentRepository } from '../provider';

export interface CreateNfeDocumentIn {
  organizationId: string;
  companyId: string;
  direction: FiscalDocumentDirection;
  environment: FiscalNfeEnvironment;
  series: number;
  number: number;
  issuerCnpj: string;
  model?: string;
}

export class CreateNfeDocument
  implements UseCase<CreateNfeDocumentIn, NfeDocument>
{
  constructor(
    private readonly nfeDocumentRepository: NfeDocumentRepository,
  ) {}

  async execute(input: CreateNfeDocumentIn): Promise<NfeDocument> {
    const document = new NfeDocument({
      organizationId: input.organizationId,
      companyId: input.companyId,
      direction: input.direction,
      environment: input.environment,
      status: 'draft',
      model: input.model ?? '55',
      series: input.series,
      number: input.number,
      issuerCnpj: input.issuerCnpj,
    });

    document.validate();
    return this.nfeDocumentRepository.create(document);
  }
}
