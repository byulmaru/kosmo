terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
    }
    tailscale = {
      source  = "tailscale/tailscale"
    }
  }
}

provider "oci" {
  # Configuration will be provided via environment variables or config file
  # OCI_TENANCY_OCID, OCI_USER_OCID, OCI_FINGERPRINT, OCI_PRIVATE_KEY_PATH, OCI_REGION
}

provider "tailscale" {
  # Configuration will be provided via environment variables or terraform.tfvars
  # TAILSCALE_API_KEY or via api_key parameter
  api_key = var.tailscale_api_key
}
