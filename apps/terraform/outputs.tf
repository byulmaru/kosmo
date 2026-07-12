output "firebase_android_app_id" {
  value = google_firebase_android_app.kosmo.app_id
}

output "firebase_ios_app_id" {
  value = google_firebase_apple_app.kosmo.app_id
}

output "firebase_project_number" {
  value = data.google_project.firebase.number
}

output "firebase_project_id" {
  value = local.firebase_project_id
}

output "gcp_service_account" {
  value = google_service_account.app_distribution.email
}

output "gcp_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.kosmo.name
}

output "terraform_gcp_service_account" {
  value = google_service_account.terraform.email
}

output "terraform_gcp_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.terraform.name
}
