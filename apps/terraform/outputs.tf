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

output "vpc_id" {
  description = "ID of the VPC prepared for EKS."
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "IPv4 CIDR block of the VPC prepared for EKS."
  value       = aws_vpc.main.cidr_block
}

output "availability_zones" {
  description = "Availability zones used by the public and private subnets."
  value       = local.network_availability_zones
}

output "public_subnet_ids" {
  description = "Public subnet IDs keyed by Terraform subnet slot."
  value       = { for key, subnet in aws_subnet.public : key => subnet.id }
}

output "private_subnet_ids" {
  description = "Private subnet IDs keyed by Terraform subnet slot. Worker nodes should use these subnets."
  value       = { for key, subnet in aws_subnet.private : key => subnet.id }
}

output "nat_gateway_id" {
  description = "Single NAT Gateway ID shared by private subnet route tables."
  value       = aws_nat_gateway.main.id
}

output "public_route_table_id" {
  description = "Public route table ID associated with all public subnets."
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "Private route table IDs keyed by private subnet slot."
  value       = { for key, route_table in aws_route_table.private : key => route_table.id }
}

output "eks_cluster_security_group_id" {
  description = "Security group ID intended for the future EKS cluster control plane."
  value       = aws_security_group.eks_cluster.id
}

output "eks_node_security_group_id" {
  description = "Security group ID intended for the future EKS worker nodes."
  value       = aws_security_group.eks_nodes.id
}

output "name_prefix" {
  description = "Shared name prefix for later AWS resources."
  value       = local.name_prefix
}

output "tags" {
  description = "Default tags that will be applied to AWS resources."
  value       = local.tags
}
