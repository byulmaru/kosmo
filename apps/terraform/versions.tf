terraform {
  required_version = "~> 1.15"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.12"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.39"
    }
  }
}
