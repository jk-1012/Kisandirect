variable "project" { type = string }
variable "environment" { type = string }
variable "cidr" { type = string }
variable "public_subnets_cidrs" { type = list(string) }
variable "private_subnets_cidrs" { type = list(string) }
variable "azs" { type = list(string) }
variable "tags" { type = map(string) }
