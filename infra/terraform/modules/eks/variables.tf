variable "project" { type = string }
variable "environment" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "cluster_role_arn" { type = string }
variable "node_role_arn" { type = string }
variable "kubernetes_version" { type = string, default = "1.29" }
variable "service_cidr" { type = string, default = "172.20.0.0/16" }
variable "desired_capacity" { type = number, default = 2 }
variable "min_size" { type = number, default = 2 }
variable "max_size" { type = number, default = 4 }
variable "instance_types" { type = list(string), default = ["t3.medium"] }
variable "tags" { type = map(string) }
