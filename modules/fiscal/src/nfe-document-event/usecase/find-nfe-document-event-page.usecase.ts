import { PageResult, UseCase } from "@nexus/shared";
import { NfeDocumentEvent } from "../model";
import {
  NfeDocumentEventPageParams,
  NfeDocumentEventRepository,
} from "../provider";

export type FindNfeDocumentEventPageIn = NfeDocumentEventPageParams;

export class FindNfeDocumentEventPage
  implements UseCase<FindNfeDocumentEventPageIn, PageResult<NfeDocumentEvent>>
{
  constructor(
    private readonly nfeDocumentEventRepository: NfeDocumentEventRepository,
  ) {}

  async execute(
    input: FindNfeDocumentEventPageIn,
  ): Promise<PageResult<NfeDocumentEvent>> {
    return this.nfeDocumentEventRepository.findPage(input);
  }
}
