provider "aws" {
  region = "ap-south-1"
}

provider "kubernetes" {
  # kubeconfig will be set via data from EKS module outputs (after cluster created)
  # See example usage in modules/eks outputs and next steps in README
}

provider "helm" {
  kubernetes {
    # configured dynamically after cluster creation
  }
}
