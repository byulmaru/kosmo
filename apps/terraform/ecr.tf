# Operational tags are intentionally mutable; release version tags remain immutable.
resource "aws_ecr_repository" "kosmo" { # nosemgrep: terraform.aws.security.aws-ecr-mutable-image-tags.aws-ecr-mutable-image-tags
  name                 = "kosmo"
  image_tag_mutability = "IMMUTABLE_WITH_EXCLUSION"

  image_tag_mutability_exclusion_filter {
    filter      = "main"
    filter_type = "WILDCARD"
  }

  image_tag_mutability_exclusion_filter {
    filter      = "stable"
    filter_type = "WILDCARD"
  }

  image_tag_mutability_exclusion_filter {
    filter      = "branch-*"
    filter_type = "WILDCARD"
  }

  image_tag_mutability_exclusion_filter {
    filter      = "sha-*"
    filter_type = "WILDCARD"
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "kosmo" {
  repository = aws_ecr_repository.kosmo.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Protect the image tagged main"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["main"]
          countType      = "imageCountMoreThan"
          countNumber    = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Protect the image tagged stable"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["stable"]
          countType      = "imageCountMoreThan"
          countNumber    = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 3
        description  = "Expire untagged images after one day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 4
        description  = "Expire non-main and non-stable images after seven days"
        selection = {
          tagStatus   = "any"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}

data "aws_iam_policy_document" "ecr_push_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam::822638974464:oidc-provider/token.actions.githubusercontent.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_owner}/${local.github_repository}:ref:refs/heads/*",
        "repo:${local.github_owner}/${local.github_repository}:ref:refs/tags/*",
      ]
    }
  }
}

resource "aws_iam_role" "ecr_push" {
  name               = "github-actions-kosmo-ecr-push"
  assume_role_policy = data.aws_iam_policy_document.ecr_push_assume_role.json
}

data "aws_iam_policy_document" "ecr_push" {
  statement {
    sid       = "GetAuthorizationToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PushKosmoImage"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.kosmo.arn]
  }
}

resource "aws_iam_role_policy" "ecr_push" {
  name   = "ecr-push-kosmo"
  role   = aws_iam_role.ecr_push.id
  policy = data.aws_iam_policy_document.ecr_push.json
}
