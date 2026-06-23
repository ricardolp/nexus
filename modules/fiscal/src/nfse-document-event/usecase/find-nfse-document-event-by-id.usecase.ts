import { UseCase } from "@nexus/shared";
import { NfseDocumentEvent } from "../model";
import { NfseDocumentEventRepository } from "../provider";

export interface FindNfseDocumentEventByIdIn {
  id: string;
}

export class FindNfseDocumentEventById
  implements UseCase<FindNfseDocumentEventByIdIn, NfseDocumentEvent | null>
{
  constructor(
    private readonly nfseDocumentEventRepository: NfseDocumentEventRepository,
  ) {}

  async execute(
    input: FindNfseDocumentEventByIdIn,
  ): Promise<NfseDocumentEvent | null> {
    return this.nfseDocumentEventRepository.findById(input.id);
  }
}
