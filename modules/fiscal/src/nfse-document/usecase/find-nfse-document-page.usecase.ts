import { PageResult, UseCase } from "@nexus/shared";
import { NfseDocument } from "../model";
import {
  NfseDocumentPageParams,
  NfseDocumentRepository,
} from "../provider";

export type FindNfseDocumentPageIn = NfseDocumentPageParams;

export class FindNfseDocumentPage
  implements UseCase<FindNfseDocumentPageIn, PageResult<NfseDocument>>
{
  constructor(
    private readonly nfseDocumentRepository: NfseDocumentRepository,
  ) {}

  async execute(
    input: FindNfseDocumentPageIn,
  ): Promise<PageResult<NfseDocument>> {
    return this.nfseDocumentRepository.findPage(input);
  }
}
