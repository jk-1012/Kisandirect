variable "project" { type = string }
variable "environment" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "vpc_id" { type = string }
variable "tags" { type = map(string) }
