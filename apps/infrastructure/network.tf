# VCN (Virtual Cloud Network)
resource "oci_core_vcn" "kosmo_vcn" {
  compartment_id = var.compartment_id
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "kosmo-vcn"
  dns_label      = "kosmovcn"

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Internet Gateway
resource "oci_core_internet_gateway" "kosmo_ig" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-internet-gateway"
  enabled        = true

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# NAT Gateway
resource "oci_core_nat_gateway" "kosmo_nat" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-nat-gateway"

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Service Gateway
resource "oci_core_service_gateway" "kosmo_sg" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-service-gateway"

  services {
    service_id = data.oci_core_services.oracle_services.services[0].id
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Route Table for Public Subnet
resource "oci_core_route_table" "kosmo_public_rt" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-public-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.kosmo_ig.id
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Route Table for Private Subnet
resource "oci_core_route_table" "kosmo_private_rt" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-private-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_nat_gateway.kosmo_nat.id
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Security List for Public Subnet (Load Balancers)
resource "oci_core_security_list" "kosmo_public_sl" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-public-security-list"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP

    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP

    tcp_options {
      min = 443
      max = 443
    }
  }

  ingress_security_rules {
    source   = "10.0.0.0/16"
    protocol = "all"
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Security List for Private Subnet (Worker Nodes)
resource "oci_core_security_list" "kosmo_private_sl" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.kosmo_vcn.id
  display_name   = "kosmo-private-security-list"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = "10.0.0.0/16"
    protocol = "all"
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP

    tcp_options {
      min = 22
      max = 22
    }
  }

  # Kubernetes API Server access
  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP

    tcp_options {
      min = 6443
      max = 6443
    }
  }

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Public Subnet for Load Balancers
resource "oci_core_subnet" "kosmo_public_subnet" {
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.kosmo_vcn.id
  cidr_block                 = "10.0.1.0/24"
  display_name               = "kosmo-public-subnet"
  dns_label                  = "public"
  route_table_id             = oci_core_route_table.kosmo_public_rt.id
  security_list_ids          = [oci_core_security_list.kosmo_public_sl.id]
  prohibit_public_ip_on_vnic = false

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Regional Private Subnet for Cluster Endpoint
resource "oci_core_subnet" "kosmo_cluster_endpoint_subnet" {
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.kosmo_vcn.id
  cidr_block                 = "10.0.2.0/24"
  display_name               = "kosmo-cluster-endpoint-subnet"
  dns_label                  = "clusterapi"
  route_table_id             = oci_core_route_table.kosmo_private_rt.id
  security_list_ids          = [oci_core_security_list.kosmo_private_sl.id]
  prohibit_public_ip_on_vnic = true

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}

# Private Subnets for Worker Nodes (one per AD)
resource "oci_core_subnet" "kosmo_private_subnet" {
  count = length(data.oci_identity_availability_domains.ads.availability_domains)
  
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.kosmo_vcn.id
  cidr_block                 = "10.0.${count.index + 3}.0/24"
  display_name               = "kosmo-private-subnet-ad${count.index + 1}"
  dns_label                  = "privatead${count.index + 1}"
  route_table_id             = oci_core_route_table.kosmo_private_rt.id
  security_list_ids          = [oci_core_security_list.kosmo_private_sl.id]
  prohibit_public_ip_on_vnic = true
  availability_domain        = data.oci_identity_availability_domains.ads.availability_domains[count.index].name

  freeform_tags = {
    "Project"     = var.project_name
    "Environment" = var.environment
  }
}
