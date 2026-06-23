output "aws_region" {
  description = "AWS region configured for this Terraform root."
  value       = var.aws_region
}

output "cluster_name" {
  description = "EKS cluster name candidate for the later cluster resource."
  value       = local.cluster_name
}

output "kubernetes_version" {
  description = "Kubernetes minor version candidate for the later EKS cluster."
  value       = var.kubernetes_version
}

output "name_prefix" {
  description = "Shared name prefix for later AWS resources."
  value       = local.name_prefix
}

output "tags" {
  description = "Default tags that will be applied to AWS resources."
  value       = local.tags
}
