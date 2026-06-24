variable "aws_region" {
  type        = string
  description = "AWS region used for the temporary EKS execution environment."
  default     = "ap-northeast-2"
}

variable "kubernetes_version" {
  type        = string
  description = "Kubernetes minor version candidate for EKS; re-check this in PROD-204 before creating the cluster."
  default     = "1.36"

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+$", var.kubernetes_version))
    error_message = "kubernetes_version must be a Kubernetes minor version in major.minor format, such as 1.36 or 2.0."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "IPv4 CIDR block for the kosmo EKS VPC."
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "Two public subnet IPv4 CIDR blocks, one per availability zone."
  default     = ["10.40.0.0/24", "10.40.1.0/24"]

  validation {
    condition = (
      length(var.public_subnet_cidrs) == 2 &&
      alltrue([for cidr in var.public_subnet_cidrs : can(cidrnetmask(cidr))])
    )
    error_message = "public_subnet_cidrs must contain exactly two valid IPv4 CIDR blocks."
  }
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "Two private subnet IPv4 CIDR blocks for EKS worker nodes, one per availability zone."
  default     = ["10.40.10.0/24", "10.40.11.0/24"]

  validation {
    condition = (
      length(var.private_subnet_cidrs) == 2 &&
      alltrue([for cidr in var.private_subnet_cidrs : can(cidrnetmask(cidr))])
    )
    error_message = "private_subnet_cidrs must contain exactly two valid IPv4 CIDR blocks."
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional tags merged into all AWS resources."
  default     = {}
}
