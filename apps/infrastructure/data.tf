# Data sources
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

data "oci_core_services" "oracle_services" {
  filter {
    name   = "name"
    values = ["All .* Services In Oracle Services Network"]
    regex  = true
  }
}

data "oci_core_images" "oracle_linux" {
  compartment_id           = var.compartment_id
  operating_system         = "Oracle Linux"
  operating_system_version = "9"
  shape                    = var.node_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# Tailscale auth key for exit node
resource "tailscale_tailnet_key" "exit_node_key" {
  reusable      = false
  ephemeral     = true
  preauthorized = true
  expiry        = 7776000  # 90 days in seconds
  description   = "Auth key for ${var.project_name} exit node"
  tags = [
    "${var.project_name}",
    "${var.environment}",
    "exit-node"
  ]
}
