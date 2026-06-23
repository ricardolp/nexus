import { UseCase } from "@nexus/shared";
import { NfseDocumentEventRepository } from "../provider";

export interface DeleteNfseDocumentEventIn {
  id: string;
}

export class DeleteNfseDocumentEvent
  implements UseCase<DeleteNfseDocumentEventIn, void>
{
  constructor(
    private readonly nfseDocumentEventRepository: NfseDocumentEventRepository,
  ) {}

  async execute(input: DeleteNfseDocumentEventIn): Promise<void> {
    await this.nfseDocumentEventRepository.delete(input.id);
  }
}
