data "aws_eks_cluster" "cluster" {
  name = aws_eks_cluster.this.name
  depends_on = [aws_eks_cluster.this]
}

data "aws_eks_cluster_auth" "cluster" {
  name = aws_eks_cluster.this.name
}

resource "aws_eks_cluster" "this" {
  name     = "${var.project}-${var.environment}-eks"
  role_arn = var.cluster_role_arn

  vpc_config {
    subnet_ids = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  kubernetes_network_config {
    service_ipv4_cidr = var.service_cidr
  }

  version = var.kubernetes_version

  tags = merge(var.tags, { Name = "${var.project}-${var.environment}-eks" })
}

resource "aws_eks_node_group" "managed" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.project}-${var.environment}-ng"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.private_subnet_ids

  scaling_config {
    desired_size = var.desired_capacity
    max_size     = var.max_size
    min_size     = var.min_size
  }

  instance_types = var.instance_types
  ami_type       = "AL2_x86_64"
}
