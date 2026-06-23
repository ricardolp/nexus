import { UseCase } from "@nexus/shared";
import { NfseDocumentEvent } from "../model";
import { NfseDocumentEventRepository } from "../provider";

export interface UpdateNfseDocumentEventIn {
  entity: NfseDocumentEvent;
}

export class UpdateNfseDocumentEvent
  implements UseCase<UpdateNfseDocumentEventIn, NfseDocumentEvent>
{
  constructor(
    private readonly nfseDocumentEventRepository: NfseDocumentEventRepository,
  ) {}

  async execute(input: UpdateNfseDocumentEventIn): Promise<NfseDocumentEvent> {
    return this.nfseDocumentEventRepository.update(input.entity);
  }
}
