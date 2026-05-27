variable "project" {
  type    = string
  default = "kisan-direct"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "tags" {
  type = map(string)
  default = {
    Owner = "Platform"
  }
}
