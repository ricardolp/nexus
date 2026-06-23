import { UseCase } from "@nexus/shared";
import { NfeDocumentEvent } from "../model";
import { NfeDocumentEventRepository } from "../provider";

export interface UpdateNfeDocumentEventIn {
  entity: NfeDocumentEvent;
}

export class UpdateNfeDocumentEvent
  implements UseCase<UpdateNfeDocumentEventIn, NfeDocumentEvent>
{
  constructor(
    private readonly nfeDocumentEventRepository: NfeDocumentEventRepository,
  ) {}

  async execute(input: UpdateNfeDocumentEventIn): Promise<NfeDocumentEvent> {
    return this.nfeDocumentEventRepository.update(input.entity);
  }
}
