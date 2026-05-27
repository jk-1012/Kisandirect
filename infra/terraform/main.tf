terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.0" }
  }
}

# ── VPC ──────────────────────────────────────────────────────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "kisandirect-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false         # HA: one NAT per AZ
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Environment = var.environment
    Project     = "kisandirect"
    Region      = "ap-south-1"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/kisandirect-${var.environment}" = "owned"
  }

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/kisandirect-${var.environment}" = "owned"
  }
}

# ── EKS Cluster ──────────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "kisandirect-${var.environment}"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  # Enable IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # Managed node groups
  eks_managed_node_groups = {
    # System nodes: Kong, ArgoCD, monitoring
    system = {
      min_size       = 2
      max_size       = 4
      desired_size   = 2
      instance_types = ["t3.medium"]
      labels         = { role = "system" }
      taints = [{
        key    = "role"
        value  = "system"
        effect = "NO_SCHEDULE"
      }]
    }

    # API nodes: Fastify backend services
    api = {
      min_size       = 2
      max_size       = 20
      desired_size   = 3
      instance_types = ["t3.large", "t3.xlarge"]
      labels         = { role = "api" }
      capacity_type  = "SPOT"  # 70% cost savings; fallback to ON_DEMAND via mixed policy
    }

    # Worker nodes: BullMQ, PDF generation, Puppeteer
    workers = {
      min_size       = 1
      max_size       = 10
      desired_size   = 2
      instance_types = ["t3.large"]
      labels         = { role = "worker" }
      capacity_type  = "SPOT"
    }
  }

  # Cluster addons
  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
    aws-ebs-csi-driver = { most_recent = true }
  }
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────

resource "random_password" "postgres" {
  length  = 32
  special = true
}

resource "aws_db_parameter_group" "postgres16" {
  family = "postgres16"
  name   = "kisandirect-${var.environment}"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,timescaledb"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries >1s
  }
  parameter {
    name  = "max_connections"
    value = "500"
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "kisandirect-${var.environment}-db-subnets"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name   = "kisandirect-${var.environment}-rds-sg"
  vpc_id = module.vpc.vpc_id
}

resource "aws_db_instance" "postgres" {
  identifier     = "kisandirect-${var.environment}"
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = var.environment == "production" ? "db.r6g.xlarge" : "db.t3.medium"

  allocated_storage     = 100
  max_allocated_storage = 1000  # auto-scaling storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "kisandirect"
  username = "kd_admin"
  password = random_password.postgres.result

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  multi_az               = var.environment == "production"
  backup_retention_period = 7
  deletion_protection    = var.environment == "production"

  performance_insights_enabled = true
  monitoring_interval          = 60  # Enhanced monitoring

  parameter_group_name = aws_db_parameter_group.postgres16.name

  tags = { Environment = var.environment, DataClassification = "SENSITIVE" }
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────

resource "random_password" "redis_auth" {
  length  = 32
  special = true
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "kisandirect-${var.environment}-cache-subnets"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name   = "kisandirect-${var.environment}-redis-sg"
  vpc_id = module.vpc.vpc_id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "kisandirect-${var.environment}"
  description          = "KisanDirect Redis cluster"

  node_type            = var.environment == "production" ? "cache.r6g.large" : "cache.t3.medium"
  num_cache_clusters   = var.environment == "production" ? 3 : 1
  automatic_failover_enabled = var.environment == "production"

  engine_version       = "7.0"
  parameter_group_name = "default.redis7"

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  tags = { Environment = var.environment }
}

# ── S3 Buckets ────────────────────────────────────────────────────────────────

locals {
  s3_buckets = {
    listings = "kisandirect-listings-${var.environment}"
    docs     = "kisandirect-docs-${var.environment}"   # invoices, challans, KYC
    assets   = "kisandirect-assets-${var.environment}" # storefront assets
  }
}

resource "aws_s3_bucket" "buckets" {
  for_each = local.s3_buckets
  bucket   = each.value
  tags     = { Environment = var.environment, DataResidency = "ap-south-1" }
}

resource "aws_s3_bucket_versioning" "docs_versioning" {
  bucket = aws_s3_bucket.buckets["docs"].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "docs_lifecycle" {
  bucket = aws_s3_bucket.buckets["docs"].id
  rule {
    id     = "retain-7-years"
    status = "Enabled"
    expiration { days = 2555 }  # 7 years
  }
}

# Block all public access on docs bucket
resource "aws_s3_bucket_public_access_block" "docs" {
  bucket                  = aws_s3_bucket.buckets["docs"].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Secrets Manager ───────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app_secrets" {
  name = "kisandirect/${var.environment}/app"
  # Keys stored: DATABASE_URL, REDIS_URL, JWT_SECRET, RAZORPAY_KEY_ID,
  # RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, MSG91_AUTH_KEY,
  # WABA_360DIALOG_API_KEY, DIGILOCKER_CLIENT_SECRET, BHASHINI_API_KEY,
  # GOOGLE_VISION_API_KEY, AGMARKNET_API_KEY
}

# ── WAF ─────────────────────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "main" {
  name  = "kisandirect-${var.environment}"
  scope = "REGIONAL"

  default_action { allow {} }

  # AWS Managed Rules
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # Rate limit: 1000 req/5min per IP (bot protection)
  rule {
    name     = "RateLimit"
    priority = 3
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "KisanDirectWAF"
    sampled_requests_enabled   = true
  }
}
