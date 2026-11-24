terraform {
  required_version = ">= 1.15.7, < 2.0.0"

  required_providers {
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.39"
    }
  }
}
