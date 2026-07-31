locals {
  postgres_backup_bucket_name = "byulmaru-kosmo-prod-postgresql-backups-822638974464"
  postgres_backup_prefix      = "kosmo-prod"
  postgres_backup_role_name   = "byulmaru-kosmo-prod-postgres-backup"
}

resource "aws_s3_bucket" "postgres_backup" {
  bucket        = local.postgres_backup_bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "postgres_backup" {
  bucket = aws_s3_bucket.postgres_backup.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "postgres_backup" {
  bucket = aws_s3_bucket.postgres_backup.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "postgres_backup" {
  bucket = aws_s3_bucket.postgres_backup.id

  rule {
    id     = "postgres-backup-retention"
    status = "Enabled"

    filter {}

    expiration {
      days = 10
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.postgres_backup]
}

data "aws_iam_policy_document" "postgres_backup_bucket" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    actions = [
      "s3:*",
    ]
    resources = [
      aws_s3_bucket.postgres_backup.arn,
      "${aws_s3_bucket.postgres_backup.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "postgres_backup" {
  bucket = aws_s3_bucket.postgres_backup.id
  policy = data.aws_iam_policy_document.postgres_backup_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.postgres_backup]
}

data "aws_iam_policy_document" "postgres_backup_assume_role" {
  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRole",
      "sts:TagSession",
    ]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "postgres_backup" {
  name               = local.postgres_backup_role_name
  assume_role_policy = data.aws_iam_policy_document.postgres_backup_assume_role.json
}

data "aws_iam_policy_document" "postgres_backup" {
  statement {
    sid    = "ListPostgresBackups"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [aws_s3_bucket.postgres_backup.arn]
  }

  statement {
    sid    = "ManagePostgresBackupObjects"
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]
    resources = [
      "${aws_s3_bucket.postgres_backup.arn}/${local.postgres_backup_prefix}/*",
    ]
  }
}

resource "aws_iam_role_policy" "postgres_backup" {
  name   = "postgres-backup-s3"
  role   = aws_iam_role.postgres_backup.id
  policy = data.aws_iam_policy_document.postgres_backup.json
}
