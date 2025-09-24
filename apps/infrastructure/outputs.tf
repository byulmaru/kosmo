# Data source for kubeconfig
data "oci_containerengine_cluster_kube_config" "kosmo_cluster_kube_config" {
  cluster_id = oci_containerengine_cluster.kosmo_oke_cluster.id
}

# Cluster outputs
output "cluster_id" {
  description = "The OCID of the OKE cluster"
  value       = oci_containerengine_cluster.kosmo_oke_cluster.id
}

output "cluster_name" {
  description = "The name of the OKE cluster"
  value       = oci_containerengine_cluster.kosmo_oke_cluster.name
}

output "cluster_endpoint" {
  description = "The Kubernetes API endpoint for the cluster"
  value       = oci_containerengine_cluster.kosmo_oke_cluster.endpoints[0].private_endpoint
}

output "kubeconfig" {
  description = "The kubeconfig content for accessing the cluster"
  value       = data.oci_containerengine_cluster_kube_config.kosmo_cluster_kube_config.content
  sensitive   = true
}

# Network outputs
output "vcn_id" {
  description = "The OCID of the VCN"
  value       = oci_core_vcn.kosmo_vcn.id
}

output "public_subnet_id" {
  description = "The OCID of the public subnet"
  value       = oci_core_subnet.kosmo_public_subnet.id
}

output "cluster_endpoint_subnet_id" {
  description = "The OCID of the cluster endpoint subnet"
  value       = oci_core_subnet.kosmo_cluster_endpoint_subnet.id
}

output "private_subnet_ids" {
  description = "The OCIDs of the worker node private subnets"
  value       = oci_core_subnet.kosmo_private_subnet[*].id
}

output "private_subnet_details" {
  description = "Details of worker node private subnets including AD mapping"
  value = {
    for i, subnet in oci_core_subnet.kosmo_private_subnet : 
    data.oci_identity_availability_domains.ads.availability_domains[i].name => {
      subnet_id   = subnet.id
      cidr_block  = subnet.cidr_block
      display_name = subnet.display_name
    }
  }
}

# Node pool output
output "node_pool_id" {
  description = "The OCID of the node pool"
  value       = oci_containerengine_node_pool.kosmo_node_pool.id
}

# Exit Node outputs
output "exit_node_public_ip" {
  description = "The public IP address of the Tailscale exit node"
  value       = oci_core_instance.kosmo_bastion.public_ip
}

output "exit_node_private_ip" {
  description = "The private IP address of the Tailscale exit node"
  value       = oci_core_instance.kosmo_bastion.private_ip
}

output "tailscale_setup_instructions" {
  description = "Instructions to access the private Kubernetes cluster via Tailscale"
  value = <<-EOT
    1. Install Tailscale on your local machine:
       - macOS: brew install tailscale
       - Linux: curl -fsSL https://tailscale.com/install.sh | sh
       - Windows: Download from https://tailscale.com/download/windows

    2. Connect to your tailnet:
       tailscale up

    3. Enable the exit node in Tailscale admin console:
       - Visit https://login.tailscale.com/admin/machines
       - Find 'kosmo-exit-node' and enable it as exit node

    4. Use exit node to access private cluster:
       tailscale up --exit-node=kosmo-exit-node

    5. Get kubeconfig and access cluster directly from your local machine:
       terraform output -raw kubeconfig > ~/.kube/config-kosmo
       export KUBECONFIG=~/.kube/config-kosmo
       kubectl get nodes
  EOT
}
