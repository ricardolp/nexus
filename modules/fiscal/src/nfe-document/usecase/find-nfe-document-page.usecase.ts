import { PageResult, UseCase } from "@nexus/shared";
import { NfeDocument } from "../model";
import {
  NfeDocumentPageParams,
  NfeDocumentRepository,
} from "../provider";

export type FindNfeDocumentPageIn = NfeDocumentPageParams;

export class FindNfeDocumentPage
  implements UseCase<FindNfeDocumentPageIn, PageResult<NfeDocument>>
{
  constructor(
    private readonly nfeDocumentRepository: NfeDocumentRepository,
  ) {}

  async execute(
    input: FindNfeDocumentPageIn,
  ): Promise<PageResult<NfeDocument>> {
    return this.nfeDocumentRepository.findPage(input);
  }
}
