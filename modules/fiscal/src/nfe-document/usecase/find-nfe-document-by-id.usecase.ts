import { UseCase } from "@nexus/shared";
import { NfeDocument } from "../model";
import { NfeDocumentRepository } from "../provider";

export interface FindNfeDocumentByIdIn {
  id: string;
}

export class FindNfeDocumentById
  implements UseCase<FindNfeDocumentByIdIn, NfeDocument | null>
{
  constructor(
    private readonly nfeDocumentRepository: NfeDocumentRepository,
  ) {}

  async execute(
    input: FindNfeDocumentByIdIn,
  ): Promise<NfeDocument | null> {
    return this.nfeDocumentRepository.findById(input.id);
  }
}
