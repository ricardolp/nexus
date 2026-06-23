export const NFE_INBOUND_QUEUE = 'nfe-inbound';

export type NfeInboundJobName = 'post-import' | 'create-delivery' | 'miro';

export type NfeInboundJobPayload = {
  nfeDocumentId: string;
};

export function nfeInboundJobId(
  nfeDocumentId: string,
  jobName: NfeInboundJobName,
): string {
  return `${nfeDocumentId}-${jobName}`;
}
