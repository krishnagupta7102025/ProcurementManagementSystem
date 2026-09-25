resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project}-frontend-${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Next.js's static export (trailingSlash: true) writes e.g. /login/index.html
# for the /login/ route — S3/CloudFront won't serve that for a request to
# bare "/login" or "/login/" without help. This function appends
# "index.html" to any request path that doesn't already end in a file
# extension, which is the standard fix for hosting a Next static export
# behind CloudFront.
resource "aws_cloudfront_function" "append_index_html" {
  name    = "${var.project}-append-index-html-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Appends index.html to extensionless request paths (Next.js static export)"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      if (uri.endsWith('/')) {
        request.uri += 'index.html';
      } else if (!uri.includes('.')) {
        request.uri += '/index.html';
      }

      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = var.frontend_domain_aliases

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.append_index_html.arn
    }
  }

  # Next.js's static export has no server to fall back to — unknown paths
  # get its own 404.html rather than CloudFront's default error page.
  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.frontend_acm_certificate_arn == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.frontend_acm_certificate_arn == "" ? [] : [1]
    content {
      acm_certificate_arn      = var.frontend_acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  tags = {
    Project = var.project
  }
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# The API distribution: the frontend above only ever gets HTTPS (CloudFront
# terminates it), so a browser fetch() to a plain http:// API would be
# blocked as mixed content. The EB environment is SingleInstance (no ALB,
# no ACM cert of its own — see eb.tf), so rather than standing up a load
# balancer + custom domain + certificate just for TLS, this puts CloudFront
# in front of the API too: it terminates HTTPS on CloudFront's own
# *.cloudfront.net domain and forwards to the EB environment over plain
# HTTP, which is fine for a server-to-server hop inside AWS.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project} API (proxies to Elastic Beanstalk over HTTP)"

  origin {
    domain_name = aws_elastic_beanstalk_environment.api.cname
    origin_id   = "eb-api"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 5
      origin_read_timeout      = 30
    }
  }

  default_cache_behavior {
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "eb-api"
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Project = var.project
  }
}
