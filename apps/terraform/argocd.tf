resource "argocd_application" "kosmo_expo" {
  lifecycle {
    ignore_changes = [
      spec[0].source[0].helm[0].parameter[0].value,
      spec[0].source[0].helm[0].parameter[1].value,
    ]
  }

  metadata {
    name      = "kosmo-expo"
    namespace = "argocd"

    annotations = {
      "argocd-image-updater.argoproj.io/image-list"           = "expo=ghcr.io/byulmaru/kosmo-web:latest"
      "argocd-image-updater.argoproj.io/expo.update-strategy" = "digest"
      "argocd-image-updater.argoproj.io/expo.helm.image-name" = "expo.image.repository"
      "argocd-image-updater.argoproj.io/expo.helm.image-tag"  = "expo.image.tag"
      "argocd-image-updater.argoproj.io/write-back-method"    = "argocd"
    }
  }

  spec {
    project = "byulmaru"

    source {
      repo_url        = "https://github.com/byulmaru/kosmo.git"
      path            = "apps/helm"
      target_revision = "main"

      helm {
        release_name = "kosmo"

        parameter {
          name  = "expo.image.repository"
          value = "ghcr.io/byulmaru/kosmo-web"
        }

        parameter {
          name  = "expo.image.tag"
          value = "latest"
        }
      }
    }

    destination {
      server    = var.argocd_cluster_server
      namespace = var.app_namespace
    }

    sync_policy {
      automated {
        prune     = true
        self_heal = true
      }

      sync_options = ["CreateNamespace=true"]
    }
  }
}
