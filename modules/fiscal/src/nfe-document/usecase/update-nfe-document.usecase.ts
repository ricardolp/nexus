import { UseCase } from "@nexus/shared";
import { NfeDocument } from "../model";
import { NfeDocumentRepository } from "../provider";

export interface UpdateNfeDocumentIn {
  entity: NfeDocument;
}

export class UpdateNfeDocument
  implements UseCase<UpdateNfeDocumentIn, NfeDocument>
{
  constructor(
    private readonly nfeDocumentRepository: NfeDocumentRepository,
  ) {}

  async execute(input: UpdateNfeDocumentIn): Promise<NfeDocument> {
    return this.nfeDocumentRepository.update(input.entity);
  }
}
