import { generateRawToken, NotFoundError, RequiredRule, UseCase, Validator } from '@nexus/shared';
import { FiscalDocumentDirection } from '../../shared/fiscal-document-direction';
import { FiscalNfeEnvironment } from '../../shared/fiscal-nfe-environment';
import { NfeDocument } from '../model';
import { NfeDocumentRepository } from '../provider';

export interface EmitNfeDocumentIn {
  organizationId: string;
  companyId: string;
  issuerCnpj: string;
  direction?: FiscalDocumentDirection;
  environment?: FiscalNfeEnvironment;
  series?: number;
  number?: number;
}

export class EmitNfeDocument implements UseCase<EmitNfeDocumentIn, NfeDocument> {
  constructor(private readonly nfeDocumentRepository: NfeDocumentRepository) {}

  async execute(input: EmitNfeDocumentIn): Promise<NfeDocument> {
    Validator.validate([
      {
        code: 'emitNfeDocument.companyId',
        value: input.companyId,
        rules: [new RequiredRule()],
      },
      {
        code: 'emitNfeDocument.issuerCnpj',
        value: input.issuerCnpj,
        rules: [new RequiredRule()],
      },
    ]);

    const draft = new NfeDocument({
      organizationId: input.organizationId,
      companyId: input.companyId,
      direction: input.direction ?? 'outbound',
      environment: input.environment ?? 'homologation',
      status: 'draft',
      model: '55',
      series: input.series ?? 1,
      number: input.number ?? 1,
      issuerCnpj: input.issuerCnpj,
    });
    draft.validate();

    const created = await this.nfeDocumentRepository.create(draft);
    const validating = created.withStatus('validating');
    validating.validate();
    const afterValidating = await this.nfeDocumentRepository.update(validating);

    const sent = afterValidating.withStatus('sent_to_sefaz');
    sent.validate();
    const afterSent = await this.nfeDocumentRepository.update(sent);

    const accessKey = this.generateAccessKey();
    const authorized = afterSent.withStatus('authorized', accessKey);
    authorized.validate();

    return this.nfeDocumentRepository.update(authorized);
  }

  private generateAccessKey(): string {
    return generateRawToken().slice(0, 44);
  }
}

export interface ConsultNfeDocumentIn {
  id: string;
  organizationId: string;
}

export class ConsultNfeDocument
  implements UseCase<ConsultNfeDocumentIn, NfeDocument>
{
  constructor(private readonly nfeDocumentRepository: NfeDocumentRepository) {}

  async execute(input: ConsultNfeDocumentIn): Promise<NfeDocument> {
    const document = await this.nfeDocumentRepository.findById(input.id);

    if (!document || document.organizationId !== input.organizationId) {
      throw new NotFoundError('Documento NFe não encontrado');
    }

    return document;
  }
}
