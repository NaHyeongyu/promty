# AWS and GitHub Deployment

This is the first production integration path for Promty.

## Target Shape

```text
GitHub
  -> GitHub Actions CI
  -> GitHub Actions AWS Deploy
  -> ECR backend image
  -> App Runner backend service
  -> S3 frontend static build
  -> CloudFront frontend distribution
  -> RDS PostgreSQL
  -> S3 published-flow assets
```

The repository now includes:

```text
.github/workflows/ci.yml
.github/workflows/aws-deploy.yml
backend/Dockerfile
```

The concrete resource inventory for this AWS account is tracked in
[aws-resource-inventory.md](aws-resource-inventory.md).

## GitHub Secrets

Set these secrets before running `AWS Deploy` manually:

```text
AWS_ROLE_TO_ASSUME
AWS_REGION
APP_RUNNER_SERVICE_ARN
ECR_REPOSITORY
FRONTEND_S3_BUCKET
CLOUDFRONT_DISTRIBUTION_ID
VITE_PROMPTHUB_API_URL
```

These are already stored in GitHub repo `NaHyeongyu/BuildHub`.

Use GitHub OIDC for `AWS_ROLE_TO_ASSUME`. The AWS role should allow:

```text
ecr:GetAuthorizationToken
ecr:BatchCheckLayerAvailability
ecr:CompleteLayerUpload
ecr:CreateRepository
ecr:InitiateLayerUpload
ecr:PutImage
ecr:UploadLayerPart
s3:DeleteObject
s3:ListBucket
s3:PutObject
cloudfront:CreateInvalidation
apprunner:StartDeployment
```

Scope S3, ECR, and App Runner permissions to the production resources.
CloudFront invalidation remains account-wide in the current inline policy
because CloudFront uses global ARNs.

The deploy workflow pushes the backend image with both the commit SHA and
`latest`. App Runner is configured to run the `latest` tag, and the workflow
calls `apprunner:StartDeployment` after pushing the image.

## Backend Runtime Environment

Configure the backend service with:

```text
DATABASE_URL=stored in Secrets Manager
PROMPTHUB_API_PUBLIC_URL=https://api.promty.org
PROMPTHUB_APP_URL=https://promty.org
PROMPTHUB_CORS_ORIGINS=https://promty.org,https://www.promty.org
PROMPTHUB_GITHUB_CLIENT_ID=stored in Secrets Manager
PROMPTHUB_GITHUB_CLIENT_SECRET=stored in Secrets Manager
PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY=stored in Secrets Manager
PROMPTHUB_APP_ENCRYPTION_KEY=stored in Secrets Manager
PROMPTHUB_OAUTH_STATE_SECRET=stored in Secrets Manager
PROMPTHUB_JWT_SECRET=stored in Secrets Manager
PROMPTHUB_SESSION_COOKIE_SECURE=true
PROMPTHUB_SESSION_COOKIE_SAMESITE=lax
PROMPTHUB_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMPTHUB_AWS_REGION=ap-southeast-2
PROMPTHUB_AWS_S3_BUCKET=promty-prod-assets-435917083683
PROMPTHUB_AWS_S3_PREFIX=published-flow-assets
PROMPTHUB_APP_ENCRYPTION_KEY_ID=aws-prod
```

The backend image exposes port `8011` and serves `GET /health`.

## GitHub OAuth Callback

In the GitHub OAuth app, configure:

```text
Homepage URL: https://promty.org
Authorization callback URL: https://api.promty.org/api/auth/github/callback
```

The web flow requests repository access so the app can list repositories and browse
files through the existing GitHub APIs.

## Asset Storage

Published flow image uploads use local disk by default. In AWS, set:

```text
PROMPTHUB_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMPTHUB_AWS_S3_BUCKET=your-private-asset-bucket
PROMPTHUB_AWS_S3_PREFIX=published-flow-assets
```

The API still serves assets through authenticated Promty endpoints. The bucket can stay private.
