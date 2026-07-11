# AWS Resource Inventory

Snapshot date: 2026-07-12

## Account

```text
AWS account id: 435917083683
Default region: ap-southeast-2
Deployment profile: promty-prod
```

## Domain

```text
Hosted zone: promty.org
Hosted zone id: Z0817292287LJZGIOAXWU
```

## Certificate

CloudFront-compatible ACM certificate:

```text
Region: us-east-1
Status: ISSUED
Certificate ARN: arn:aws:acm:us-east-1:435917083683:certificate/8827f663-4b1e-4f94-b8e7-9b2b6544f49e
Domains:
  promty.org
  www.promty.org
  api.promty.org
```

Validation records are tracked in:

```text
infra/aws/promty-acm-validation-records.json
```

## ECR

```text
Repository name: promty/backend
Repository ARN: arn:aws:ecr:ap-southeast-2:435917083683:repository/promty/backend
Repository URI: 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend
Scan on push: enabled
Encryption: AES256
```

## S3

Frontend bucket:

```text
Name: promty-prod-frontend-435917083683
ARN: arn:aws:s3:::promty-prod-frontend-435917083683
Public access: blocked
Versioning: enabled
Default encryption: AES256
```

Private asset bucket:

```text
Name: promty-prod-assets-435917083683
ARN: arn:aws:s3:::promty-prod-assets-435917083683
Public access: blocked
Versioning: enabled
Default encryption: AES256
```

## GitHub Actions IAM

```text
Role name: promty-github-actions-deploy
Role ARN: arn:aws:iam::435917083683:role/promty-github-actions-deploy
Trusted GitHub repo: NaHyeongyu/BuildHub
```

Policy files:

```text
infra/aws/promty-github-actions-trust.json
infra/aws/promty-github-actions-policy.json
```

## GitHub Secrets To Set

```text
AWS_ROLE_TO_ASSUME=arn:aws:iam::435917083683:role/promty-github-actions-deploy
AWS_REGION=ap-southeast-2
ECR_REPOSITORY=promty/backend
FRONTEND_S3_BUCKET=promty-prod-frontend-435917083683
VITE_PROMPTHUB_API_URL=https://api.promty.org
```

Pending until CloudFront is created:

```text
CLOUDFRONT_DISTRIBUTION_ID=
```

## Backend Runtime Environment

Use these values for the backend runtime after the backend host is created:

```text
PROMPTHUB_API_PUBLIC_URL=https://api.promty.org
PROMPTHUB_APP_URL=https://promty.org
PROMPTHUB_CORS_ORIGINS=https://promty.org,https://www.promty.org
PROMPTHUB_SESSION_COOKIE_SECURE=true
PROMPTHUB_SESSION_COOKIE_SAMESITE=lax
PROMPTHUB_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMPTHUB_AWS_REGION=ap-southeast-2
PROMPTHUB_AWS_S3_BUCKET=promty-prod-assets-435917083683
PROMPTHUB_AWS_S3_PREFIX=published-flow-assets
```

Still required before backend production launch:

```text
DATABASE_URL
PROMPTHUB_GITHUB_CLIENT_ID
PROMPTHUB_GITHUB_CLIENT_SECRET
PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY
PROMPTHUB_APP_ENCRYPTION_KEY
PROMPTHUB_APP_ENCRYPTION_KEY_ID=aws-prod
PROMPTHUB_OAUTH_STATE_SECRET
PROMPTHUB_JWT_SECRET
```
