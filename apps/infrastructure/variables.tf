variable "compartment_id" {
  description = "The OCID of the compartment where resources will be created"
  type        = string
}

variable "node_shape" {
  description = "The shape of the worker nodes"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "node_ocpus" {
  description = "The number of OCPUs for each worker node"
  type        = number
  default     = 2
}

variable "node_memory_in_gbs" {
  description = "The amount of memory in GBs for each worker node"
  type        = number
  default     = 8
}

variable "node_count" {
  description = "The number of worker nodes in the node pool"
  type        = number
  default     = 1
}

variable "ssh_public_key" {
  description = "The SSH public key for accessing worker nodes"
  type        = string
}

variable "kubernetes_version" {
  description = "The Kubernetes version for the cluster and node pool"
  type        = string
  default     = "v1.33.1"
}

variable "project_name" {
  description = "The name of the project for tagging resources"
  type        = string
  default     = "kosmo"
}

variable "environment" {
  description = "The environment name for tagging resources"
  type        = string
  default     = "production"
}

variable "tailscale_api_key" {
  description = "Tailscale API key for managing the tailnet"
  type        = string
  sensitive   = true
}

variable "bastion_shape" {
  description = "The shape of the bastion instance"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "bastion_ocpus" {
  description = "The number of OCPUs for the bastion instance"
  type        = number
  default     = 1
}

variable "bastion_memory_in_gbs" {
  description = "The amount of memory in GBs for the bastion instance"
  type        = number
  default     = 4
}
