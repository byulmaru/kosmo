terraform {
  required_version = "~> 1.15"

  required_providers {
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.39"
    }
  }
}
