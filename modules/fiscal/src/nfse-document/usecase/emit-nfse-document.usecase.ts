import { generateRawToken, NotFoundError, RequiredRule, UseCase, Validator } from '@nexus/shared';
import { FiscalDocumentDirection } from '../../shared/fiscal-document-direction';
import { FiscalNfseEnvironment } from '../../shared/fiscal-nfse-environment';
import { NfseDocument } from '../model';
import { NfseDocumentRepository } from '../provider';

export interface EmitNfseDocumentIn {
  organizationId: string;
  companyId: string;
  issuerCnpj: string;
  direction?: FiscalDocumentDirection;
  environment?: FiscalNfseEnvironment;
  series?: number;
  number?: number;
}

export class EmitNfseDocument
  implements UseCase<EmitNfseDocumentIn, NfseDocument>
{
  constructor(private readonly nfseDocumentRepository: NfseDocumentRepository) {}

  async execute(input: EmitNfseDocumentIn): Promise<NfseDocument> {
    Validator.validate([
      {
        code: 'emitNfseDocument.companyId',
        value: input.companyId,
        rules: [new RequiredRule()],
      },
      {
        code: 'emitNfseDocument.issuerCnpj',
        value: input.issuerCnpj,
        rules: [new RequiredRule()],
      },
    ]);

    const draft = new NfseDocument({
      organizationId: input.organizationId,
      companyId: input.companyId,
      direction: input.direction ?? 'outbound',
      environment: input.environment ?? 'homologation',
      status: 'draft',
      model: 'NFSe',
      series: input.series ?? 1,
      number: input.number ?? 1,
      issuerCnpj: input.issuerCnpj,
    });
    draft.validate();

    const created = await this.nfseDocumentRepository.create(draft);
    const validating = created.withStatus('validating');
    validating.validate();
    const afterValidating = await this.nfseDocumentRepository.update(validating);

    const sent = afterValidating.withStatus('sent_to_prefeitura');
    sent.validate();
    const afterSent = await this.nfseDocumentRepository.update(sent);

    const accessKey = generateRawToken().slice(0, 44);
    const authorized = afterSent.withStatus('authorized', accessKey);
    authorized.validate();

    return this.nfseDocumentRepository.update(authorized);
  }
}

export interface ConsultNfseDocumentIn {
  id: string;
  organizationId: string;
}

export class ConsultNfseDocument
  implements UseCase<ConsultNfseDocumentIn, NfseDocument>
{
  constructor(private readonly nfseDocumentRepository: NfseDocumentRepository) {}

  async execute(input: ConsultNfseDocumentIn): Promise<NfseDocument> {
    const document = await this.nfseDocumentRepository.findById(input.id);

    if (!document || document.organizationId !== input.organizationId) {
      throw new NotFoundError('Documento NFSe não encontrado');
    }

    return document;
  }
}
