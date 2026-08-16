provider "argocd" {
  grpc_web = true
}

resource "argocd_application_set" "kosmo" {
  metadata {
    name      = "kosmo"
    namespace = "argocd"
  }

  spec {
    generator {
      list {
        elements = [
          {
            env       = "dev"
            namespace = "kosmo-dev"
            webDomain = "dev.kos.moe"
            apiDomain = "dev-api.kos.moe"
            image     = "ghcr.io/byulmaru/kosmo"
            version   = "main"
          },
        ]
      }
    }

    template {
      metadata {
        name = "kosmo-{{env}}"
      }

      spec {
        project                = "kosmo"
        revision_history_limit = 10

        source {
          repo_url        = "https://github.com/byulmaru/kosmo.git"
          target_revision = "main"
          path            = "apps/helm"

          helm {
            release_name = "kosmo"
            values       = <<-EOT
              env: '{{env}}'
              webDomain: '{{webDomain}}'
              apiDomain: '{{apiDomain}}'
              image: '{{image}}'
              version: '{{version}}'
            EOT
          }
        }

        destination {
          server    = "https://kubernetes.default.svc"
          namespace = "{{namespace}}"
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
  }
}

resource "argocd_application" "kosmo_prod" {
  cascade = false
  wait    = false

  lifecycle {
    # PROD-764 owns the release-time source revision and parameter overlay.
    # Terraform continues to own the base values and Application structure.
    ignore_changes = [
      spec[0].source[0].target_revision,
      spec[0].source[0].helm[0].parameter,
    ]
  }

  metadata {
    name      = "kosmo-prod"
    namespace = "argocd"
  }

  spec {
    project                = "kosmo"
    revision_history_limit = 10

    source {
      repo_url        = "https://github.com/byulmaru/kosmo.git"
      target_revision = "production"
      path            = "apps/helm"

      helm {
        release_name = "kosmo"
        values       = <<-EOT
          env: 'prod'
          webDomain: 'kos.moe'
          apiDomain: 'api.kos.moe'
          image: 'ghcr.io/byulmaru/kosmo'
          version: '0.0.0'
        EOT
      }
    }

    destination {
      server    = "https://kubernetes.default.svc"
      namespace = "kosmo-prod"
    }

    sync_policy {
      sync_options = ["CreateNamespace=true"]
    }
  }
}

import {
  to = argocd_application_set.kosmo
  id = "kosmo:argocd"
}
