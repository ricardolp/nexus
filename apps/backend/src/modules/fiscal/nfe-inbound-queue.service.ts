import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  NFE_INBOUND_QUEUE,
  NfeInboundJobName,
  nfeInboundJobId,
} from './nfe-inbound.queue';

@Injectable()
export class NfeInboundQueueService {
  private readonly logger = new Logger(NfeInboundQueueService.name);

  constructor(
    @InjectQueue(NFE_INBOUND_QUEUE)
    private readonly queue: Queue,
  ) {}

  async enqueue(jobName: NfeInboundJobName, nfeDocumentId: string): Promise<void> {
    const jobId = nfeInboundJobId(nfeDocumentId, jobName);
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      }
    }

    await this.queue.add(
      jobName,
      { nfeDocumentId },
      { jobId },
    );
  }

  async enqueuePostImport(nfeDocumentId: string): Promise<void> {
    await this.enqueue('post-import', nfeDocumentId);
  }

  async enqueueMiro(nfeDocumentId: string): Promise<void> {
    await this.enqueue('miro', nfeDocumentId);
  }

  async removeJobsForDocument(nfeDocumentId: string): Promise<void> {
    const jobNames: NfeInboundJobName[] = [
      'post-import',
      'create-delivery',
      'miro',
    ];
    for (const jobName of jobNames) {
      try {
        const job = await this.queue.getJob(
          nfeInboundJobId(nfeDocumentId, jobName),
        );
        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed to remove ${jobName} job for document ${nfeDocumentId}`,
          error,
        );
      }
    }
  }
}
