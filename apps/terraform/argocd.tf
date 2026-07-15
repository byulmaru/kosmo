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

import {
  to = argocd_application_set.kosmo
  id = "kosmo:argocd"
}
