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

output "android_play_service_account" {
  value = google_service_account.android_play_publisher.email
}

output "android_play_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.android_play.name
}

output "terraform_gcp_service_account" {
  value = google_service_account.terraform.email
}

output "terraform_gcp_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.terraform.name
}

output "postgres_backup_bucket_arn" {
  value = aws_s3_bucket.postgres_backup.arn
}

output "postgres_backup_role_arn" {
  value = aws_iam_role.postgres_backup.arn
}
