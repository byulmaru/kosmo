terraform {
  required_version = "~> 1.15"

  required_providers {
    argocd = {
      source  = "argoproj-labs/argocd"
      version = "~> 7.15"
    }

    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.39"
    }
  }
}
