terraform {
  backend "oci" {
    auth   = "ResourcePrincipal"
    bucket = "byulmaru-terraform-state"
    key    = "kosmo/terraform.tfstate"
    region = "ap-chuncheon-1"
  }
}
