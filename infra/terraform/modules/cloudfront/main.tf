resource "aws_cloudfront_origin_access_identity" "oai" {
  comment = "OAI for ${var.project}"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
  default_root_object = "index.html"

  origins {
    domain_name = var.origin_domain
    origin_id   = "alb-origin-${var.project}"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb-origin-${var.project}"
    viewer_protocol_policy = "redirect-to-https"
    compress = true
    min_ttl = 0
    default_ttl = 3600
    max_ttl = 86400
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
  tags = var.tags
}
