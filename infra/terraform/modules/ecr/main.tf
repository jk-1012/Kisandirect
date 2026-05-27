resource "aws_ecr_repository" "app" {
  name                 = "${var.project}-${var.environment}-app"
  image_tag_mutability = "MUTABLE"
  tags = merge(var.tags, { Name = "${var.project}-${var.environment}-ecr" })
}
