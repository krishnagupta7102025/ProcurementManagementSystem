# Drives the approval-SLA escalation job (P2P-023) by hitting
# GET /internal/cron/escalation-scan on a schedule — the same
# CRON_SECRET-bearer-token endpoint used during the Vercel Cron experiment
# (apps/api/src/approval/cron.controller.ts), just triggered by EventBridge
# Scheduler instead. Unlike Vercel's Hobby-plan cap of once/day, EventBridge
# Scheduler has no such limit, so this restores the original 15-minute
# cadence the BullMQ-based design used before the brief serverless detour.

resource "aws_cloudwatch_event_connection" "escalation_cron" {
  name               = "${var.project}-escalation-cron-${var.environment}"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${random_password.cron_secret.result}"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "escalation_cron" {
  name                             = "${var.project}-escalation-cron-${var.environment}"
  invocation_endpoint              = "http://${aws_elastic_beanstalk_environment.api.cname}/internal/cron/escalation-scan"
  http_method                      = "GET"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.escalation_cron.arn
}

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "escalation_scheduler" {
  name               = "${var.project}-escalation-scheduler-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
}

data "aws_iam_policy_document" "escalation_scheduler_invoke" {
  statement {
    actions   = ["events:InvokeApiDestination"]
    resources = [aws_cloudwatch_event_api_destination.escalation_cron.arn]
  }
}

resource "aws_iam_role_policy" "escalation_scheduler_invoke" {
  name   = "${var.project}-escalation-scheduler-invoke"
  role   = aws_iam_role.escalation_scheduler.id
  policy = data.aws_iam_policy_document.escalation_scheduler_invoke.json
}

resource "aws_scheduler_schedule" "escalation_scan" {
  name       = "${var.project}-escalation-scan-${var.environment}"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = "rate(15 minutes)"

  target {
    arn      = aws_cloudwatch_event_api_destination.escalation_cron.arn
    role_arn = aws_iam_role.escalation_scheduler.arn
  }
}
