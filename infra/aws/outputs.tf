output "ecr_repository_url" {
  description = "Push the API's Docker image here (see docs/deploy-aws.md)."
  value       = aws_ecr_repository.api.repository_url
}

output "eb_environment_url" {
  description = "The API's raw Elastic Beanstalk environment URL (HTTP only — for direct debugging/curl, not for the frontend to call)."
  value       = "http://${aws_elastic_beanstalk_environment.api.cname}"
}

output "api_url" {
  description = "The API's public HTTPS URL (via CloudFront) — this is what NEXT_PUBLIC_API_URL should be set to."
  value       = "https://${aws_cloudfront_distribution.api.domain_name}"
}

output "rds_endpoint" {
  description = "RDS MySQL endpoint (host:port) — DATABASE_URL is already wired into the EB environment automatically."
  value       = aws_db_instance.this.endpoint
}

output "db_password" {
  description = "Generated RDS master password — needed if you ever connect with a MySQL client directly instead of through the app."
  value       = random_password.db.result
  sensitive   = true
}

output "documents_bucket_name" {
  value = aws_s3_bucket.documents.bucket
}

output "frontend_bucket_name" {
  description = "Sync the Next.js static export here (see docs/deploy-aws.md)."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_domain_name" {
  description = "The frontend's public URL (unless a custom domain alias is configured)."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_distribution_id" {
  description = "Needed to invalidate the CDN cache after each frontend deploy."
  value       = aws_cloudfront_distribution.frontend.id
}
