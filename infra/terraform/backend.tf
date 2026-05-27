terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.9"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.7"
    }
  }

  backend "s3" {
    bucket         = "kisan-terraform-state-ap-south-1"
    key            = "kisan/infra/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "kisan-terraform-locks"
  }
}
