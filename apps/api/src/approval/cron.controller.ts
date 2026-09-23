import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { EscalationService } from './escalation.service.js';

/**
 * Replaces the old BullMQ repeatable job (approval-sla-scan) — Vercel's
 * serverless runtime has nowhere to host a long-lived worker process, so
 * this is triggered by a Vercel Cron Job instead (see apps/api/vercel.json
 * for the schedule). Vercel Cron always issues a GET request, and
 * automatically attaches `Authorization: Bearer $CRON_SECRET` when a
 * CRON_SECRET env var is set on the project — that's what's checked below,
 * so this can't be triggered by anyone who doesn't already know the secret.
 *
 * Deliberately outside AuthGuard/RolesGuard: this is a system call, not an
 * app user, and has no org/user context to authenticate as.
 */
@Controller('internal/cron')
export class CronController {
  constructor(private readonly escalation: EscalationService) {}

  @Get('escalation-scan')
  async escalationScan(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException();
    }
    return this.escalation.runOnce();
  }
}
