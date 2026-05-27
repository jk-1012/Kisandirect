resource "aws_vpc" "this" {
  cidr_block = var.cidr
  tags       = merge(var.tags, { Name = "${var.project}-${var.environment}-vpc" })
}

resource "aws_subnet" "private" {
  count                   = length(var.private_subnets_cidrs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.private_subnets_cidrs[count.index]
  availability_zone       = var.azs[count.index % length(var.azs)]
  map_public_ip_on_launch = false
  tags = merge(var.tags, { Name = "${var.project}-${var.environment}-private-${count.index}" })
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnets_cidrs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnets_cidrs[count.index]
  availability_zone       = var.azs[count.index % length(var.azs)]
  map_public_ip_on_launch = true
  tags = merge(var.tags, { Name = "${var.project}-${var.environment}-public-${count.index}" })
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.project}-${var.environment}-igw" })
}
