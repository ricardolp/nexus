import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NfeInboundService } from './nfe-inbound.service';
import {
  NFE_INBOUND_QUEUE,
  NfeInboundJobName,
  NfeInboundJobPayload,
} from './nfe-inbound.queue';

@Injectable()
@Processor(NFE_INBOUND_QUEUE)
export class NfeInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(NfeInboundProcessor.name);

  constructor(private readonly inboundService: NfeInboundService) {
    super();
  }

  async process(job: Job<NfeInboundJobPayload, void, NfeInboundJobName>) {
    const { nfeDocumentId } = job.data;
    this.logger.log(`Processing ${job.name} for ${nfeDocumentId}`);

    switch (job.name) {
      case 'post-import':
        await this.inboundService.runPostImportPipeline(nfeDocumentId);
        break;
      case 'create-delivery':
        await this.inboundService.runCreateDelivery(nfeDocumentId);
        break;
      case 'miro':
        await this.inboundService.runMiro(nfeDocumentId);
        break;
      default:
        throw new Error(`Unknown nfe-inbound job: ${job.name}`);
    }
  }
}
