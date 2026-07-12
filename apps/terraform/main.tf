locals {
  firebase_project_id  = "byulmaru-kosmo"
  github_owner         = "byulmaru"
  github_repository    = "kosmo"
  github_repository_id = "1207798099"
  github_owner_id      = "29172280"

  app_identifier     = "moe.kos"
  distribution_group = "native-testers"
  environment        = "native-test-distribution"
}

provider "google-beta" {
  project               = local.firebase_project_id
  billing_project       = local.firebase_project_id
  user_project_override = true
}

provider "google-beta" {
  alias                 = "no_user_project_override"
  project               = local.firebase_project_id
  user_project_override = false
}

provider "github" {
  owner = local.github_owner
}

data "google_project" "firebase" {
  provider   = google-beta
  project_id = local.firebase_project_id
}

resource "google_project_service" "required" {
  provider = google-beta.no_user_project_override
  project  = local.firebase_project_id
  for_each = toset([
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "firebaseappdistribution.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "serviceusage.googleapis.com",
    "sts.googleapis.com",
  ])
  service = each.key

  disable_on_destroy = false
}

resource "google_firebase_project" "kosmo" {
  provider = google-beta
  project  = local.firebase_project_id

  depends_on = [google_project_service.required]
}

resource "google_firebase_android_app" "kosmo" {
  provider = google-beta
  project  = google_firebase_project.kosmo.project

  display_name    = "Kosmo Android"
  package_name    = local.app_identifier
  deletion_policy = "PREVENT"
}

resource "google_firebase_apple_app" "kosmo" {
  provider = google-beta
  project  = google_firebase_project.kosmo.project

  display_name    = "Kosmo iOS"
  bundle_id       = local.app_identifier
  deletion_policy = "PREVENT"
}

resource "google_service_account" "app_distribution" {
  provider = google-beta
  project  = local.firebase_project_id

  account_id      = "firebase-app-distribution"
  display_name    = "Firebase App Distribution from GitHub Actions"
  deletion_policy = "PREVENT"

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "app_distribution" {
  provider = google-beta
  project  = local.firebase_project_id
  role     = "roles/firebaseappdistro.admin"
  member   = "serviceAccount:${google_service_account.app_distribution.email}"
}

resource "google_iam_workload_identity_pool" "github_actions" {
  provider = google-beta
  project  = local.firebase_project_id

  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  deletion_policy           = "PREVENT"

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "kosmo" {
  provider = google-beta
  project  = local.firebase_project_id

  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
  workload_identity_pool_provider_id = "kosmo-native-distribution"
  display_name                       = "Kosmo native distribution"
  deletion_policy                    = "PREVENT"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.environment"         = "assertion.environment"
    "attribute.ref"                 = "assertion.ref"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.workflow_ref"        = "assertion.workflow_ref"
  }
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${local.github_repository_id}'",
    "assertion.repository_owner_id == '${local.github_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.environment == '${local.environment}'",
    "assertion.workflow_ref == '${local.github_owner}/${local.github_repository}/.github/workflows/native-distribution-foundation.yml@refs/heads/main'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_actions" {
  provider           = google-beta
  service_account_id = google_service_account.app_distribution.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions.name}/attribute.repository_id/${local.github_repository_id}"

  depends_on = [google_iam_workload_identity_pool_provider.kosmo]
}

resource "github_repository_environment" "native_distribution" {
  repository        = local.github_repository
  environment       = local.environment
  can_admins_bypass = false

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "main" {
  repository     = local.github_repository
  environment    = github_repository_environment.native_distribution.environment
  branch_pattern = "main"
}

resource "github_actions_environment_variable" "native_distribution" {
  for_each = {
    FIREBASE_ANDROID_APP_ID        = google_firebase_android_app.kosmo.app_id
    FIREBASE_IOS_APP_ID            = google_firebase_apple_app.kosmo.app_id
    FIREBASE_PROJECT_ID            = local.firebase_project_id
    FIREBASE_TESTER_GROUP          = local.distribution_group
    GCP_SERVICE_ACCOUNT            = google_service_account.app_distribution.email
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.kosmo.name
  }

  repository    = local.github_repository
  environment   = github_repository_environment.native_distribution.environment
  variable_name = each.key
  value         = each.value
}
