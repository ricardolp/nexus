import { UseCase } from "@nexus/shared";
import { NfseDocument } from "../model";
import { NfseDocumentRepository } from "../provider";

export interface UpdateNfseDocumentIn {
  entity: NfseDocument;
}

export class UpdateNfseDocument
  implements UseCase<UpdateNfseDocumentIn, NfseDocument>
{
  constructor(
    private readonly nfseDocumentRepository: NfseDocumentRepository,
  ) {}

  async execute(input: UpdateNfseDocumentIn): Promise<NfseDocument> {
    return this.nfseDocumentRepository.update(input.entity);
  }
}
