import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ESCALATION_QUEUE } from './escalation.processor.js';

// How often the scan job fires — independent of the reminder/escalate
// thresholds themselves (APPROVAL_SLA_REMINDER_HOURS / _ESCALATE_HOURS in
// escalation.service.ts). Defaults to every 15 minutes.
const CHECK_INTERVAL_MS = Number(process.env.APPROVAL_SLA_CHECK_INTERVAL_MS ?? 15 * 60 * 1000);

@Injectable()
export class EscalationScheduler implements OnModuleInit {
  constructor(@InjectQueue(ESCALATION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // upsertJobScheduler is idempotent by key — safe to call on every
    // boot without creating duplicate repeatable jobs.
    await this.queue.upsertJobScheduler('approval-sla-scan', { every: CHECK_INTERVAL_MS });
  }
}
