# Exit Node Instance with Tailscale
resource "oci_core_instance" "kosmo_bastion" {
  compartment_id      = var.compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "kosmo-tailscale-exit-node"
  shape               = var.bastion_shape

  shape_config {
    memory_in_gbs = var.bastion_memory_in_gbs
    ocpus         = var.bastion_ocpus
  }

  create_vnic_details {
    subnet_id                 = oci_core_subnet.kosmo_public_subnet.id
    display_name              = "kosmo-exit-node-vnic"
    assign_public_ip          = true
    assign_private_dns_record = true
    nsg_ids                   = [oci_core_network_security_group.kosmo_exit_node_nsg.id]
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.oracle_linux.images[0].id
    boot_volume_size_in_gbs = 50
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/user-data.sh", {
      tailscale_authkey = tailscale_tailnet_key.exit_node_key.key
    }))
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
    "Role"        = "tailscale-exit-node"
  }
}
