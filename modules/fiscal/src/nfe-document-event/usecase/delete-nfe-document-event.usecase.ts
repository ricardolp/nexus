import { UseCase } from "@nexus/shared";
import { NfeDocumentEventRepository } from "../provider";

export interface DeleteNfeDocumentEventIn {
  id: string;
}

export class DeleteNfeDocumentEvent
  implements UseCase<DeleteNfeDocumentEventIn, void>
{
  constructor(
    private readonly nfeDocumentEventRepository: NfeDocumentEventRepository,
  ) {}

  async execute(input: DeleteNfeDocumentEventIn): Promise<void> {
    await this.nfeDocumentEventRepository.delete(input.id);
  }
}
