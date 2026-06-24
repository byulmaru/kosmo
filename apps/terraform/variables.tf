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

variable "tags" {
  type        = map(string)
  description = "Additional tags merged into all AWS resources once resources are added."
  default     = {}
}
