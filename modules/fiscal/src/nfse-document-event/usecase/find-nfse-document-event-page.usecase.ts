import { PageResult, UseCase } from "@nexus/shared";
import { NfseDocumentEvent } from "../model";
import {
  NfseDocumentEventPageParams,
  NfseDocumentEventRepository,
} from "../provider";

export type FindNfseDocumentEventPageIn = NfseDocumentEventPageParams;

export class FindNfseDocumentEventPage
  implements UseCase<FindNfseDocumentEventPageIn, PageResult<NfseDocumentEvent>>
{
  constructor(
    private readonly nfseDocumentEventRepository: NfseDocumentEventRepository,
  ) {}

  async execute(
    input: FindNfseDocumentEventPageIn,
  ): Promise<PageResult<NfseDocumentEvent>> {
    return this.nfseDocumentEventRepository.findPage(input);
  }
}
