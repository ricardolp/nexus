import { UseCase } from "@nexus/shared";
import { NfeDocumentEvent } from "../model";
import { NfeDocumentEventRepository } from "../provider";

export interface FindNfeDocumentEventByIdIn {
  id: string;
}

export class FindNfeDocumentEventById
  implements UseCase<FindNfeDocumentEventByIdIn, NfeDocumentEvent | null>
{
  constructor(
    private readonly nfeDocumentEventRepository: NfeDocumentEventRepository,
  ) {}

  async execute(
    input: FindNfeDocumentEventByIdIn,
  ): Promise<NfeDocumentEvent | null> {
    return this.nfeDocumentEventRepository.findById(input.id);
  }
}
