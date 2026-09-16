import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { EscalationService } from './escalation.service.js';

export const ESCALATION_QUEUE = 'approval-escalation';

@Processor(ESCALATION_QUEUE)
export class EscalationProcessor extends WorkerHost {
  constructor(private readonly escalation: EscalationService) {
    super();
  }

  async process(_job: Job): Promise<{ remindersSent: number; escalationsSent: number }> {
    return this.escalation.runOnce();
  }
}
