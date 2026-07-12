terraform {
  backend "s3" {
    bucket       = "byulmaru-terraform-state"
    key          = "kosmo/firebase.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true
  }
}
