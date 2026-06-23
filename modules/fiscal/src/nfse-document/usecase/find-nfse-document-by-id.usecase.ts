import { UseCase } from "@nexus/shared";
import { NfseDocument } from "../model";
import { NfseDocumentRepository } from "../provider";

export interface FindNfseDocumentByIdIn {
  id: string;
}

export class FindNfseDocumentById
  implements UseCase<FindNfseDocumentByIdIn, NfseDocument | null>
{
  constructor(
    private readonly nfseDocumentRepository: NfseDocumentRepository,
  ) {}

  async execute(
    input: FindNfseDocumentByIdIn,
  ): Promise<NfseDocument | null> {
    return this.nfseDocumentRepository.findById(input.id);
  }
}
