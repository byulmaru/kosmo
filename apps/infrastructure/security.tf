# Network Security Group for Exit Node
resource "oci_core_network_security_group" "kosmo_exit_node_nsg" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-exit-node-nsg"

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# NSG Rules for Exit Node
resource "oci_core_network_security_group_security_rule" "exit_node_egress_all" {
  network_security_group_id = oci_core_network_security_group.kosmo_exit_node_nsg.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
}

resource "oci_core_network_security_group_security_rule" "exit_node_ingress_ssh" {
  network_security_group_id = oci_core_network_security_group.kosmo_exit_node_nsg.id
  direction                 = "INGRESS"
  protocol                  = "6" # TCP
  source                    = "0.0.0.0/0"

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_network_security_group_security_rule" "exit_node_ingress_tailscale" {
  network_security_group_id = oci_core_network_security_group.kosmo_exit_node_nsg.id
  direction                 = "INGRESS"
  protocol                  = "17" # UDP
  source                    = "0.0.0.0/0"

  udp_options {
    destination_port_range {
      min = 41641
      max = 41641
    }
  }
}
