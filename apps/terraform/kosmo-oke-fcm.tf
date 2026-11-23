resource "google_iam_workload_identity_pool" "oke_kosmo" {
  provider = google-beta
  project  = local.firebase_project_id

  workload_identity_pool_id = "kosmo-oke"
  display_name              = "Kosmo OKE"
  deletion_policy           = "PREVENT"

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "oke_kosmo_worker" {
  provider = google-beta
  project  = local.firebase_project_id

  workload_identity_pool_id          = google_iam_workload_identity_pool.oke_kosmo.workload_identity_pool_id
  workload_identity_pool_provider_id = "kosmo-worker"
  display_name                       = "Kosmo OKE Worker"
  deletion_policy                    = "PREVENT"

  attribute_mapping = {
    "google.subject" = "assertion.sub"
  }
  attribute_condition = "assertion.sub in ['system:serviceaccount:kosmo-dev:kosmo-worker', 'system:serviceaccount:kosmo-prod:kosmo-worker']"

  oidc {
    issuer_uri = "https://kubernetes.default.svc.cluster.local"
    jwks_json  = file("${path.module}/kosmo-oke-jwks.json")
  }
}

resource "google_service_account_iam_member" "firebase_fcm_sender_oke" {
  provider           = google-beta
  service_account_id = google_service_account.firebase_fcm_sender.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.oke_kosmo.name}/subject/system:serviceaccount:kosmo-dev:kosmo-worker"

  depends_on = [google_iam_workload_identity_pool_provider.oke_kosmo_worker]
}

resource "google_service_account_iam_member" "firebase_fcm_sender_oke_prod" {
  provider           = google-beta
  service_account_id = google_service_account.firebase_fcm_sender.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.oke_kosmo.name}/subject/system:serviceaccount:kosmo-prod:kosmo-worker"

  depends_on = [google_iam_workload_identity_pool_provider.oke_kosmo_worker]
}
