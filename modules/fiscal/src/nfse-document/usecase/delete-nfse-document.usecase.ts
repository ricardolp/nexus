import { UseCase } from "@nexus/shared";
import { NfseDocumentRepository } from "../provider";

export interface DeleteNfseDocumentIn {
  id: string;
}

export class DeleteNfseDocument
  implements UseCase<DeleteNfseDocumentIn, void>
{
  constructor(
    private readonly nfseDocumentRepository: NfseDocumentRepository,
  ) {}

  async execute(input: DeleteNfseDocumentIn): Promise<void> {
    await this.nfseDocumentRepository.delete(input.id);
  }
}
