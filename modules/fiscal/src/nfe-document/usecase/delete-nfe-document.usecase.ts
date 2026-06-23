import { UseCase } from "@nexus/shared";
import { NfeDocumentRepository } from "../provider";

export interface DeleteNfeDocumentIn {
  id: string;
}

export class DeleteNfeDocument
  implements UseCase<DeleteNfeDocumentIn, void>
{
  constructor(
    private readonly nfeDocumentRepository: NfeDocumentRepository,
  ) {}

  async execute(input: DeleteNfeDocumentIn): Promise<void> {
    await this.nfeDocumentRepository.delete(input.id);
  }
}
