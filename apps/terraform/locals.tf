locals {
  cluster_name = "kosmo"
  name_prefix  = local.cluster_name

  tags = merge(
    {
      ManagedBy = "terraform"
      Project   = "kosmo"
    },
    var.tags,
  )
}
