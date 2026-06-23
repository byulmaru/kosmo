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
    condition     = can(regex("^1\\.[0-9]+$", var.kubernetes_version))
    error_message = "kubernetes_version must be a Kubernetes minor version such as 1.36."
  }
}

variable "node_groups" {
  type = map(object({
    capacity_type  = optional(string)
    instance_types = optional(list(string))
    min_size       = optional(number)
    desired_size   = optional(number)
    max_size       = optional(number)
  }))
  description = "Worker node group interface placeholder. Concrete sizing and capacity choices belong to PROD-205."
  default     = {}
}

variable "tags" {
  type        = map(string)
  description = "Additional tags merged into all AWS resources once resources are added."
  default     = {}
}
