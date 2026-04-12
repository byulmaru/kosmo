terraform {
  backend "s3" {
    bucket                      = "terraform-state"
    key                         = "kosmo"
    region                      = "auto"
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
  }

  required_providers {
    argocd = {
      source  = "argoproj-labs/argocd"
      version = "~> 7"
    }
  }
}

provider "argocd" {}
