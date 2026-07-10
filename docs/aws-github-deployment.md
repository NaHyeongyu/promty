# AWS and GitHub Deployment

This is the first production integration path for Promty.

## Target Shape

```text
GitHub
  -> GitHub Actions CI
  -> GitHub Actions AWS Deploy
  -> ECR backend image
  -> S3 frontend static build
  -> CloudFront frontend distribution
  -> Backend runtime on ECS, App Runner, or another container service
  -> RDS PostgreSQL
  -> S3 published-flow assets
```

The repository now includes:

```text
.github/workflows/ci.yml
.github/workflows/aws-deploy.yml
backend/Dockerfile
```

## GitHub Secrets

Set these secrets before running `AWS Deploy` manually:

```text
AWS_ROLE_TO_ASSUME
AWS_REGION
ECR_REPOSITORY
FRONTEND_S3_BUCKET
CLOUDFRONT_DISTRIBUTION_ID
VITE_PROMPTHUB_API_URL
```

`FRONTEND_S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, and
`VITE_PROMPTHUB_API_URL` are optional for the workflow shape, but production
frontend deploys should set them.

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
```

Scope the S3 and CloudFront permissions to the production buckets/distribution.

## Backend Runtime Environment

Configure the backend service with:

```text
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/promty
PROMPTHUB_API_PUBLIC_URL=https://api.example.com
PROMPTHUB_APP_URL=https://app.example.com
PROMPTHUB_CORS_ORIGINS=https://app.example.com
PROMPTHUB_GITHUB_CLIENT_ID=
PROMPTHUB_GITHUB_CLIENT_SECRET=
PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY=
PROMPTHUB_APP_ENCRYPTION_KEY=
PROMPTHUB_APP_ENCRYPTION_KEY_ID=aws-prod
PROMPTHUB_OAUTH_STATE_SECRET=
PROMPTHUB_JWT_SECRET=
PROMPTHUB_SESSION_COOKIE_SECURE=true
PROMPTHUB_SESSION_COOKIE_SAMESITE=lax
PROMPTHUB_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMPTHUB_AWS_REGION=
PROMPTHUB_AWS_S3_BUCKET=
PROMPTHUB_AWS_S3_PREFIX=published-flow-assets
```

The backend image exposes port `8011` and serves `GET /health`.

## GitHub OAuth Callback

In the GitHub OAuth app, configure:

```text
Homepage URL: https://app.example.com
Authorization callback URL: https://api.example.com/api/auth/github/callback
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
