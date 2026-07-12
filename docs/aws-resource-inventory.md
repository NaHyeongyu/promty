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
Frontend domains: promty.org, www.promty.org
API domain: api.promty.org
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

App Runner also manages its own certificate for `api.promty.org`. Its DNS
validation records are tracked in:

```text
infra/aws/promty-apprunner-api-domain-validation-records.json
```

## CloudFront

```text
Distribution id: E3RJ7YU3NUZQSF
Distribution domain: d20rjon9u3lu41.cloudfront.net
Aliases: promty.org, www.promty.org
Status: Deployed
Origin: promty-prod-frontend-435917083683.s3.ap-southeast-2.amazonaws.com
Origin access control id: ETUAJRENPIY53
```

CloudFront and frontend DNS configuration are tracked in:

```text
infra/aws/promty-cloudfront-distribution.json
infra/aws/promty-cloudfront-oac.json
infra/aws/promty-frontend-bucket-policy.json
infra/aws/promty-frontend-dns-records.json
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

## RDS

```text
Engine: PostgreSQL
Identifier: promty-prod-db
Endpoint: promty-prod-db.cvaakqisupj8.ap-southeast-2.rds.amazonaws.com
Port: 5432
Database name: promty
Username: promty_admin
Storage encryption: enabled
Deletion protection: enabled
Subnet group: promty-prod-db-subnet-group
Security group: sg-0c72a43cc84b5deef
```

## Networking

```text
VPC: vpc-05abd8dcef72223fa
Subnets:
  subnet-04375abf87cc69d46 ap-southeast-2c
  subnet-0d63d0c4ab49394a4 ap-southeast-2a
  subnet-0e3be0293016e6f06 ap-southeast-2b
Private App Runner subnets:
  subnet-0af40d93ce08cdcdb ap-southeast-2a 172.31.240.0/24
  subnet-0429cf93c3adaf1da ap-southeast-2b 172.31.241.0/24
  subnet-0ce13e28691072dcf ap-southeast-2c 172.31.242.0/24
NAT gateway: nat-0fed17885361650db
NAT elastic IP allocation: eipalloc-0f5803a28421ddec2
Private route table: rtb-06de908c3a504844d
Legacy App Runner security group: sg-07bcfdc3e060768d9
NAT App Runner security group: sg-0fb1480facd964b0e
RDS security group: sg-0c72a43cc84b5deef
RDS inbound rules:
  tcp/5432 from sg-07bcfdc3e060768d9
  tcp/5432 from sg-0fb1480facd964b0e
Active App Runner VPC connector:
  arn:aws:apprunner:ap-southeast-2:435917083683:vpcconnector/promty-prod-vpc-connector-nat/1/280069a9ab9e46e4817f07222989b896
Legacy App Runner VPC connector:
  arn:aws:apprunner:ap-southeast-2:435917083683:vpcconnector/promty-prod-vpc-connector/1/7ce24bfd0e1c4a9db9fbc8086b5e53a4
```

## Secrets Manager

```text
promty/prod/database-url
promty/prod/app-encryption-key
promty/prod/github-client-id
promty/prod/github-client-secret
promty/prod/github-token-encryption-key
promty/prod/oauth-state-secret
promty/prod/jwt-secret
```

GitHub OAuth client id and secret are stored in Secrets Manager and exposed to
App Runner as runtime secrets.

## App Runner

```text
Service name: promty-prod-api
Service ARN: arn:aws:apprunner:ap-southeast-2:435917083683:service/promty-prod-api/04be6335c00f43fb86dd2d3506f95700
Default URL: https://xcyfny8pb3.ap-southeast-2.awsapprunner.com
Custom domain: https://api.promty.org
Status: RUNNING
Custom domain status: active
Image: 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend:latest
Health check: GET /health on port 8011
```

App Runner roles and service configuration:

```text
ECR access role: arn:aws:iam::435917083683:role/promty-apprunner-ecr-access
Instance role: arn:aws:iam::435917083683:role/promty-apprunner-instance
Service config: infra/aws/promty-apprunner-service.json
API DNS record: infra/aws/promty-api-dns-records.json
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

## GitHub Secrets

```text
AWS_ROLE_TO_ASSUME=arn:aws:iam::435917083683:role/promty-github-actions-deploy
AWS_REGION=ap-southeast-2
APP_RUNNER_SERVICE_ARN=arn:aws:apprunner:ap-southeast-2:435917083683:service/promty-prod-api/04be6335c00f43fb86dd2d3506f95700
ECR_REPOSITORY=promty/backend
FRONTEND_S3_BUCKET=promty-prod-frontend-435917083683
CLOUDFRONT_DISTRIBUTION_ID=E3RJ7YU3NUZQSF
VITE_PROMPTHUB_API_URL=https://api.promty.org
```

These are already stored in GitHub repo `NaHyeongyu/BuildHub`.

## Backend Runtime Environment

These values are configured on App Runner:

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
PROMPTHUB_APP_ENCRYPTION_KEY_ID=aws-prod
PROMTY_MEMORY_GENERATOR=local
PROMTY_MEMORY_DRAFT_GENERATOR=local
PROMTY_PROJECT_MEMORY_GENERATOR=local
```

Stored as App Runner runtime secrets from Secrets Manager:

```text
DATABASE_URL
PROMPTHUB_GITHUB_CLIENT_ID
PROMPTHUB_GITHUB_CLIENT_SECRET
PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY
PROMPTHUB_APP_ENCRYPTION_KEY
PROMPTHUB_OAUTH_STATE_SECRET
PROMPTHUB_JWT_SECRET
```
