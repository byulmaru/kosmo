# OKE Cluster
resource "oci_containerengine_cluster" "kosmo_oke_cluster" {
  compartment_id     = var.compartment_id
  kubernetes_version = var.kubernetes_version
  name               = "kosmo-oke-cluster"
  vcn_id             = oci_core_vcn.kosmo_vcn.id

  endpoint_config {
    is_public_ip_enabled = false
    subnet_id            = oci_core_subnet.kosmo_cluster_endpoint_subnet.id
  }

  options {
    service_lb_subnet_ids = [oci_core_subnet.kosmo_public_subnet.id]

    add_ons {
      is_kubernetes_dashboard_enabled = true
      is_tiller_enabled               = false
    }

    kubernetes_network_config {
      pods_cidr     = "10.244.0.0/16"
      services_cidr = "10.96.0.0/16"
    }

    persistent_volume_config {
      freeform_tags = {
        "Project" = var.project_name
      }
    }
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Node Pool
resource "oci_containerengine_node_pool" "kosmo_node_pool" {
  cluster_id         = oci_containerengine_cluster.kosmo_oke_cluster.id
  compartment_id     = var.compartment_id
  kubernetes_version = var.kubernetes_version
  name               = "kosmo-node-pool"

  node_config_details {
    dynamic "placement_configs" {
      for_each = data.oci_identity_availability_domains.ads.availability_domains
      content {
        availability_domain = placement_configs.value.name
        subnet_id           = oci_core_subnet.kosmo_private_subnet[placement_configs.key].id
      }
    }

    size = var.node_count

    freeform_tags = {
      "Project"     = var.project_name
      "Environment" = var.environment
    }
  }

  node_shape = var.node_shape

  node_shape_config {
    memory_in_gbs = var.node_memory_in_gbs
    ocpus         = var.node_ocpus
  }

  node_source_details {
    image_id                = data.oci_core_images.oracle_linux.images[0].id
    source_type             = "IMAGE"
    boot_volume_size_in_gbs = "50"
  }

  initial_node_labels {
    key   = "environment"
    value = var.environment
  }

  ssh_public_key = var.ssh_public_key

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}
