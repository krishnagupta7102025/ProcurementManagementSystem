# Small private bucket just for Elastic Beanstalk application-version
# source bundles (the Dockerrun.aws.json pointing at the ECR image) —
# distinct from the app's own document/frontend buckets.
resource "aws_s3_bucket" "eb_deploys" {
  bucket = "${var.project}-eb-deploys-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "eb_deploys" {
  bucket                  = aws_s3_bucket.eb_deploys.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "random_password" "auth_jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "cron_secret" {
  length  = 48
  special = false
}

# Bootstrap application version — points at the ":latest" tag in the ECR
# repo. Push a real image with that tag *before* running `terraform apply`
# for the first time (see docs/deploy-aws.md) so the environment comes up
# healthy immediately; every later `eb deploy` / CI push replaces the
# running image without touching this Terraform-managed version.
data "archive_file" "eb_bootstrap" {
  type        = "zip"
  output_path = "${path.module}/.terraform-build/dockerrun.zip"

  source {
    content = templatefile("${path.module}/templates/Dockerrun.aws.json.tpl", {
      image_uri = "${aws_ecr_repository.api.repository_url}:latest"
    })
    filename = "Dockerrun.aws.json"
  }
}

resource "aws_s3_object" "eb_bootstrap" {
  bucket = aws_s3_bucket.eb_deploys.id
  key    = "bootstrap/dockerrun-${data.archive_file.eb_bootstrap.output_md5}.zip"
  source = data.archive_file.eb_bootstrap.output_path
  etag   = data.archive_file.eb_bootstrap.output_md5
}

resource "aws_elastic_beanstalk_application" "api" {
  name        = "${var.project}-api-${var.environment}"
  description = "Losung360 P2P API (NestJS, Docker)"
}

resource "aws_elastic_beanstalk_application_version" "bootstrap" {
  name        = "bootstrap-${data.archive_file.eb_bootstrap.output_md5}"
  application = aws_elastic_beanstalk_application.api.name
  bucket      = aws_s3_bucket.eb_deploys.id
  key         = aws_s3_object.eb_bootstrap.key
}

resource "aws_elastic_beanstalk_environment" "api" {
  name                = "${var.project}-api-${var.environment}"
  application         = aws_elastic_beanstalk_application.api.name
  solution_stack_name = var.eb_solution_stack_name
  version_label       = aws_elastic_beanstalk_application_version.bootstrap.name

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = var.eb_instance_type
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = aws_iam_instance_profile.eb_instance.name
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "SecurityGroups"
    value     = aws_security_group.eb.id
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "ServiceRole"
    value     = aws_iam_role.eb_service.name
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "VPCId"
    value     = data.aws_vpc.default.id
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "Subnets"
    value     = join(",", data.aws_subnets.default.ids)
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "SingleInstance" # no ALB — cheapest option; switch to LoadBalanced for real HA
  }

  # --- Application environment variables ---
  # (mirrors .env.example — see apps/api/src/main.ts / prisma.service.ts for
  # how each is consumed)

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "NODE_ENV"
    value     = "production"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "PORT"
    value     = "3001"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "DATABASE_URL"
    value     = "mysql://${var.db_username}:${random_password.db.result}@${aws_db_instance.this.address}:3306/${var.db_name}"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "AUTH_JWT_SECRET"
    value     = random_password.auth_jwt_secret.result
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "CRON_SECRET"
    value     = random_password.cron_secret.result
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "S3_BUCKET"
    value     = aws_s3_bucket.documents.bucket
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "S3_REGION"
    value     = var.aws_region
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "CORS_ALLOWED_ORIGINS"
    value     = "https://${aws_cloudfront_distribution.frontend.domain_name}"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "NOTIFICATION_CENTER_API_URL"
    value     = ""
  }

  tags = {
    Project = var.project
  }
}
