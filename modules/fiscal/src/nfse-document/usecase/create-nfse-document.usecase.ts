import { UseCase } from '@nexus/shared';
import { FiscalDocumentDirection } from '../../shared/fiscal-document-direction';
import { FiscalNfseEnvironment } from '../../shared/fiscal-nfse-environment';
import { NfseDocument } from '../model';
import { NfseDocumentRepository } from '../provider';

export interface CreateNfseDocumentIn {
  organizationId: string;
  companyId: string;
  direction: FiscalDocumentDirection;
  environment: FiscalNfseEnvironment;
  series: number;
  number: number;
  issuerCnpj: string;
  model?: string;
}

export class CreateNfseDocument
  implements UseCase<CreateNfseDocumentIn, NfseDocument>
{
  constructor(
    private readonly nfseDocumentRepository: NfseDocumentRepository,
  ) {}

  async execute(input: CreateNfseDocumentIn): Promise<NfseDocument> {
    const document = new NfseDocument({
      organizationId: input.organizationId,
      companyId: input.companyId,
      direction: input.direction,
      environment: input.environment,
      status: 'draft',
      model: input.model ?? 'NFSe',
      series: input.series,
      number: input.number,
      issuerCnpj: input.issuerCnpj,
    });

    document.validate();
    return this.nfseDocumentRepository.create(document);
  }
}
