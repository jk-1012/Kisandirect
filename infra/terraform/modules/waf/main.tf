resource "aws_wafv2_web_acl" "this" {
  name        = "${var.project}-${var.environment}-waf"
  scope       = "REGIONAL"
  description = "WAF for ALB"

  default_action { allow {} }

  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config { sampled_requests_enabled = true; cloudwatch_metrics_enabled = true; metric_name = "aws_managed_common" }
  }

  rule {
    name     = "rate-limit-1000-10m"
    priority = 10
    action { block {} }
    statement { rate_based_statement { limit = 1000; aggregate_key_type = "IP" } }
    visibility_config { sampled_requests_enabled = true; cloudwatch_metrics_enabled = true; metric_name = "rate_limit" }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "kisan_waf"
    sampled_requests_enabled   = true
  }
}
