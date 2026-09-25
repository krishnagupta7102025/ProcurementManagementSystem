# Document storage (PO PDFs, invoice/requisition attachments) — see
# apps/api/src/storage/storage.service.ts. Private; the API accesses it via
# its instance role (see iam.tf), never via public URLs.
resource "aws_s3_bucket" "documents" {
  bucket = "${var.project}-documents-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_caller_identity" "current" {}

# Frontend static export (apps/web, `next build` with output: 'export').
# Private — served only via the CloudFront distribution in cloudfront.tf
# through an Origin Access Control, not directly.
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project}-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "frontend_cloudfront_read" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_cloudfront_read.json
}
