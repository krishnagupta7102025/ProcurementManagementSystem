variable "aws_region" {
  description = "Matches CLAUDE.md's original infra note (AWS ap-south-1 / Mumbai)."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Short name used as a prefix for every resource this stack creates."
  type        = string
  default     = "p2p"
}

variable "environment" {
  description = "Deployment environment name (e.g. production, staging)."
  type        = string
  default     = "production"
}

variable "db_instance_class" {
  description = "RDS instance size. db.t3.micro is eligible for the AWS free tier for the first 12 months on a new account."
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "p2p"
}

variable "db_username" {
  type    = string
  default = "p2p"
}

variable "db_multi_az" {
  description = "CLAUDE.md's original infra note asked for multi-AZ. Off by default here to stay inside the RDS free tier (multi-AZ is not free-tier eligible) — flip to true when this is handling real production traffic/data."
  type        = bool
  default     = false
}

variable "eb_instance_type" {
  type    = string
  default = "t3.micro"
}

variable "eb_solution_stack_name" {
  description = <<-EOT
    Elastic Beanstalk Docker platform solution stack. AWS revises these
    strings periodically — before applying, verify the current one with:
      aws elasticbeanstalk list-available-solution-stacks --query "SolutionStacks[?contains(@, 'Docker')]"
    and override this variable if it's changed.
  EOT
  type    = string
  default = "64bit Amazon Linux 2023 v4.5.1 running Docker"
}

variable "frontend_domain_aliases" {
  description = "Optional custom domain(s) to attach to the CloudFront distribution (requires an ACM certificate in us-east-1 — see docs/deploy-aws.md). Leave empty to use the default *.cloudfront.net domain only."
  type        = list(string)
  default     = []
}

variable "frontend_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1, required only if frontend_domain_aliases is non-empty."
  type        = string
  default     = ""
}
