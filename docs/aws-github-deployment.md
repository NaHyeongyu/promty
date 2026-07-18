# AWS and GitHub Deployment Runbook

Promty production deployment is managed through GitHub, GitHub Actions, and AWS.
This document is the operator guide for Git work, deployment, domain checks,
cost-sensitive AWS operations, and common recovery steps.

Do not commit real access keys, OAuth secrets, npm tokens, GitHub tokens, or
database passwords. If a token is pasted into chat, docs, a commit, or logs,
revoke or rotate it before continuing.

## Current Production Shape

```text
Developer machine
  -> Git branch / commit / push
  -> GitHub pull request
  -> GitHub Actions CI
  -> Manual GitHub Actions AWS Deploy
  -> Frontend build
  -> S3 frontend bucket
  -> CloudFront distribution
  -> Backend Docker image
  -> ECR repository
  -> SSM command to EC2
  -> EC2 Docker backend and Project Memory worker restart
  -> EC2 local PostgreSQL container
  -> S3 private asset and database backup bucket
```

Important production endpoints:

```text
Frontend: https://promty.org
Frontend alias: https://www.promty.org
API: https://api.promty.org
API readiness: https://api.promty.org/health/ready
Repository: https://github.com/NaHyeongyu/promty
Production branch: master
AWS region: ap-southeast-2
AWS deployment profile: promty-prod
```

The exact AWS resource inventory is tracked in
[aws-resource-inventory.md](aws-resource-inventory.md). Treat that file as the
source of truth for resource IDs and ARNs.

## What EC2 Does Here

The API is currently hosted on one low-cost EC2 instance instead of App Runner
plus RDS plus NAT Gateway.

On EC2:

- Caddy serves `api.promty.org` and manages the Let's Encrypt certificate.
- The backend runs from the ECR image `promty/backend:latest`.
- The Project Memory worker runs from the same image as a separate container.
- PostgreSQL 18 runs locally in Docker.
- Published-flow assets are stored in S3.
- Database backups are dumped daily to S3 by `promty-db-backup.timer`.
- AWS Systems Manager is used for deploy and operations. There is no SSH inbound
  rule.

Active instance:

```text
Instance id: i-066ab5e01b9685b6a
Elastic IP: 13.237.112.139
Instance type: t3a.micro
IAM role: promty-ec2-api-instance
```

Legacy App Runner has been deleted and no longer receives `api.promty.org` traffic.
Previous RDS was deleted after creating final snapshot
`promty-prod-db-final-20260712-ec2-cutover`.

## Required Local Tools

Install and authenticate these on the machine used for operations:

```text
git
gh
aws
docker
node 22
npm
python 3.12
```

Check tool availability:

```bash
git --version
gh --version
aws --version
docker --version
node --version
npm --version
python3 --version
```

## AWS CLI Setup

Use the existing IAM user access key only on a trusted local machine.

Configure a named profile:

```bash
aws configure --profile promty-prod
```

Use these values:

```text
AWS Access Key ID: existing IAM access key id
AWS Secret Access Key: existing IAM secret access key
Default region name: ap-southeast-2
Default output format: json
```

Where to find or manage the access key:

```text
AWS Console
  -> IAM
  -> Users
  -> select the existing deployment/operator IAM user
  -> Security credentials
  -> Access keys
```

The secret access key is shown only when the access key is created. If it is no
longer available, create a new access key, update the local AWS CLI profile, and
deactivate the old key after confirming the new one works.

Verify the configured account:

```bash
aws sts get-caller-identity --profile promty-prod
aws configure list --profile promty-prod
```

Expected account id:

```text
435917083683
```

To avoid repeatedly passing `--profile`, set this in the current terminal:

```bash
export AWS_PROFILE=promty-prod
export AWS_REGION=ap-southeast-2
```

## GitHub CLI Setup

Authenticate GitHub CLI:

```bash
gh auth login
```

Recommended choices:

```text
GitHub.com
HTTPS
Login with a web browser
```

If GitHub shows a device code, copy that code into the browser page that GitHub
opens. If two-factor authentication is enabled, approve it in the browser. The
terminal normally does not need a separate OTP field for this flow.

Verify:

```bash
gh auth status
gh repo view NaHyeongyu/promty
```

The local remote is:

```bash
git remote -v
```

Expected:

```text
origin  https://github.com/NaHyeongyu/promty.git (fetch)
origin  https://github.com/NaHyeongyu/promty.git (push)
```

## Local Development Runbook

Start the full local stack:

```bash
docker compose up --build
```

Local URLs:

```text
Frontend: http://127.0.0.1:5173
API readiness: http://127.0.0.1:8011/health/ready
PostgreSQL: localhost:5432
```

If you only want PostgreSQL in Docker and want to run backend/frontend on the
host:

```bash
docker compose up -d postgres
./.venv/bin/alembic -c backend/alembic.ini upgrade head
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8011
```

In another terminal, start the Project Memory worker:

```bash
cd backend
../.venv/bin/python -m app.workers.project_memory
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Local environment files:

```text
.env.local
backend/.env.local
frontend/.env.local
docker/compose.env
docs/promty.env.example
```

Use [promty.env.example](promty.env.example) as the copy source. Real values go
into ignored `.env.local` files or AWS Secrets Manager, not committed docs.

## Daily Git Workflow

Start from a clean view of the current branch:

```bash
git status --short
git branch --show-current
git fetch origin
```

Create a feature branch from the latest base branch:

```bash
git switch master
git pull --ff-only origin master
git switch -c feature/short-description
```

If the repository later moves to `main`, use `main` for the base branch.

Before committing:

```bash
git status --short
git diff
git diff --staged
```

Run relevant checks. For broad changes, run all of these:

```bash
python -m pytest
python -m pytest collector/tests
ruff check backend collector
cd frontend
npm run build
npm test
```

Commit intentionally:

```bash
git add path/to/file another/path
git commit -m "feat: describe the change"
```

Use `git add .` only after reviewing `git status --short`; it can accidentally
include local env files, generated outputs, or unrelated work.

Push the branch:

```bash
git push -u origin feature/short-description
```

Open a pull request:

```bash
gh pr create --base master --head feature/short-description --fill
```

Check PR status:

```bash
gh pr view --web
gh pr checks
```

## Existing Local Changes

Before pulling, rebasing, switching branches, or resolving conflicts, always
check whether there are local changes:

```bash
git status --short
```

If the changes are yours and ready:

```bash
git add path/to/files
git commit -m "chore: save current work"
```

If the changes are unfinished but should be kept out of the next operation:

```bash
git stash push -u -m "wip before deploy"
```

Restore later:

```bash
git stash list
git stash pop
```

Do not run destructive cleanup commands like `git reset --hard`, `git clean -fd`,
or `git checkout -- path` unless you are intentionally discarding work.

## Pull Request Conflict Workflow

When GitHub shows:

```text
This branch has conflicts that must be resolved
```

Use the command line:

```bash
git fetch origin
git switch your-branch
git merge origin/master
```

If the base branch later moves to `main`, use `origin/main`.

Find conflicted files:

```bash
git status --short
rg "<<<<<<<|=======|>>>>>>>" .
```

Open each conflicted file and remove conflict markers by choosing or combining
the correct code.

After editing:

```bash
rg "<<<<<<<|=======|>>>>>>>" .
git add resolved/file.py resolved/file.tsx
git commit
git push
```

Then confirm on GitHub:

```bash
gh pr checks
gh pr view --web
```

## GitHub Actions

CI workflow:

```text
.github/workflows/ci.yml
```

CI runs on pull requests and pushes to `master` or `main`. It checks:

- Ruff for `backend` and `collector`
- backend tests
- collector tests
- collector package validation
- frontend production build
- frontend tests

AWS deploy workflow:

```text
.github/workflows/aws-deploy.yml
```

`AWS Deploy` is manual. It does not automatically deploy every PR. The AWS OIDC
trust policy allows the production deploy role only from `refs/heads/master`.
Deploy after the target commit is merged and CI is green.

Run deploy from the GitHub UI:

```text
GitHub repo
  -> Actions
  -> AWS Deploy
  -> Run workflow
  -> select branch
  -> optional image_tag
  -> Run workflow
```

Run deploy from CLI:

```bash
gh workflow run "AWS Deploy" --repo NaHyeongyu/promty --ref master
```

Optional custom backend image tag:

```bash
gh workflow run "AWS Deploy" \
  --repo NaHyeongyu/promty \
  --ref master \
  -f image_tag="$(git rev-parse HEAD)"
```

Watch the run:

```bash
gh run list --repo NaHyeongyu/promty --workflow "AWS Deploy"
gh run watch --repo NaHyeongyu/promty
```

## What AWS Deploy Does

The deploy workflow:

1. assumes the AWS IAM role through GitHub OIDC
2. installs frontend dependencies
3. builds the frontend with `VITE_PROMTY_API_URL`
4. syncs `frontend/dist` to the private S3 frontend bucket
5. creates a CloudFront invalidation for `/*`
6. logs in to ECR
7. builds the backend Docker image
8. pushes the image to ECR with the commit SHA tag and `latest`
9. sends an SSM command to EC2
10. pulls the latest image on EC2
11. replaces the `promty-backend` container with a 7-connection maximum pool budget
12. checks database-backed readiness inside the `promty-backend` container
13. starts `promty-memory-worker` with a separate 3-connection maximum pool budget

GitHub repository secrets required by the workflow:

```text
AWS_ROLE_TO_ASSUME
AWS_REGION
AWS_EC2_INSTANCE_ID
ECR_REPOSITORY
FRONTEND_S3_BUCKET
CLOUDFRONT_DISTRIBUTION_ID
VITE_PROMTY_API_URL
```

Current values are documented in
[aws-resource-inventory.md](aws-resource-inventory.md). They are stored in
GitHub repo `NaHyeongyu/promty`.

List GitHub secrets:

```bash
gh secret list --repo NaHyeongyu/promty
```

Set or update a GitHub secret:

```bash
gh secret set AWS_REGION --repo NaHyeongyu/promty --body "ap-southeast-2"
gh secret set AWS_EC2_INSTANCE_ID --repo NaHyeongyu/promty --body "i-066ab5e01b9685b6a"
```

For sensitive values, prefer interactive input instead of putting values in shell
history:

```bash
gh secret set SOME_SECRET --repo NaHyeongyu/promty
```

## Production Runtime Environment

EC2 backend runtime variables live in:

```text
/opt/promty/backend.env
```

Non-secret values:

```text
PROMTY_API_PUBLIC_URL=https://api.promty.org
PROMTY_APP_URL=https://promty.org
PROMTY_CORS_ORIGINS=https://promty.org,https://www.promty.org
PROMTY_SESSION_COOKIE_SECURE=true
PROMTY_SESSION_COOKIE_SAMESITE=lax
PROMTY_ADMIN_GITHUB_IDS=191438254
PROMTY_AUTH_RATE_LIMIT_REQUESTS=30
PROMTY_AUTH_RATE_LIMIT_WINDOW_SECONDS=60
PROMTY_ADMIN_RATE_LIMIT_REQUESTS=120
PROMTY_ADMIN_RATE_LIMIT_WINDOW_SECONDS=60
PROMTY_COMMUNITY_RATE_LIMIT_REQUESTS=120
PROMTY_COMMUNITY_RATE_LIMIT_WINDOW_SECONDS=60
PROMTY_INGEST_RATE_LIMIT_REQUESTS=120
PROMTY_INGEST_RATE_LIMIT_WINDOW_SECONDS=60
PROMTY_TRUSTED_PROXY_CIDRS=127.0.0.0/8,::1/128,172.16.0.0/12
PROMTY_EVENT_BATCH_MAX_BODY_BYTES=8388608
PROMTY_ADMIN_AUDIT_RETENTION_DAYS=180
PROMTY_SUPPORT_EMAIL_PROVIDER=ses
PROMTY_SUPPORT_FROM_EMAIL=support@promty.org
PROMTY_SUPPORT_NOTIFICATION_EMAILS=stored in Secrets Manager
PROMTY_SUPPORT_RATE_LIMIT_REQUESTS=5
PROMTY_SUPPORT_RATE_LIMIT_WINDOW_SECONDS=300
PROMTY_BUFFER_CHANNEL_IDS={} # optional; use base or locale-specific channel keys
PROMTY_DEVTO_ORGANIZATION_ID= # optional
PROMTY_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMTY_AWS_REGION=ap-southeast-2
PROMTY_AWS_S3_BUCKET=promty-prod-assets-435917083683
PROMTY_AWS_S3_PREFIX=published-flow-assets
PROMTY_APP_ENCRYPTION_KEY_ID=aws-prod
PROMTY_MEMORY_GENERATOR=openai
PROMTY_MEMORY_DRAFT_GENERATOR=openai
PROMTY_PROJECT_MEMORY_GENERATOR=openai
PROMTY_OPENAI_API_KEY=stored in Secrets Manager
```

Secret values come from AWS Secrets Manager during EC2 bootstrap:

```text
promty/prod/ec2-postgres-password
promty/prod/app-encryption-key
promty/prod/github-client-id
promty/prod/github-client-secret
promty/prod/github-token-encryption-key
promty/prod/oauth-state-secret
promty/prod/jwt-secret
promty/prod/buffer-api-key (optional)
promty/prod/devto-api-key (optional)
promty/prod/github-marketing-token (optional)
promty/prod/global-ingest-token
promty/prod/openai-api-key
```

The old `promty/prod/database-url` secret was used for the one-time RDS to EC2
Postgres migration.

Update a secret:

```bash
aws secretsmanager put-secret-value \
  --profile promty-prod \
  --region ap-southeast-2 \
  --secret-id promty/prod/github-client-secret \
  --secret-string "replace-with-new-secret"
```

After changing a runtime secret, update `/opt/promty/backend.env` or rerun the
EC2 bootstrap logic intentionally, then restart the backend container:

```bash
aws ssm send-command \
  --profile promty-prod \
  --region ap-southeast-2 \
  --instance-ids i-066ab5e01b9685b6a \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["docker restart promty-backend","docker restart promty-memory-worker","docker exec promty-backend python -c \"import urllib.request; print(urllib.request.urlopen('\''http://127.0.0.1:8011/health/ready'\'', timeout=5).read().decode())\""]'
```

### Encryption key rotation

Rotate encryption keys one at a time during a controlled maintenance window:

1. Create a fresh random value and publish it as a new Secrets Manager version.
2. Keep the prior secret version labelled `AWSPREVIOUS`. EC2 bootstrap writes that version
   into the corresponding decrypt-only `*_PREVIOUS_KEYS` variable.
3. Recreate the backend and memory-worker containers so they read the new environment.
4. Run the validation pass inside the backend container:

   ```bash
   python scripts/reencrypt_sensitive_data.py --dry-run
   python scripts/reencrypt_github_tokens.py --dry-run
   ```

5. Re-encrypt stored values with the current key:

   ```bash
   python scripts/reencrypt_sensitive_data.py
   python scripts/reencrypt_github_tokens.py
   ```

6. Verify login, repository browsing, project activity, and Project Memory reads before
   removing the previous key. Do not begin another rotation while data still requires a key
   older than `AWSPREVIOUS`.

GitHub tokens are also lazily re-encrypted when used. Rotating the JWT secret signs out all
web sessions; rotate it separately from the OAuth state secret so failures are easy to
isolate. Never remove an application encryption key until the full re-encryption command
has completed and a backup has been verified.

## Domain And DNS

Domain ownership and DNS are in Route 53:

```text
Hosted zone: promty.org
Hosted zone id: Z0817292287LJZGIOAXWU
Frontend domains: promty.org, www.promty.org
API domain: api.promty.org
```

Frontend:

- `promty.org` and `www.promty.org` point to CloudFront.
- CloudFront serves static files from the private S3 frontend bucket.
- The CloudFront ACM certificate is in `us-east-1`.

API:

- `api.promty.org` is an A record pointing to EC2 Elastic IP `13.237.112.139`.
- Caddy on EC2 manages the API TLS certificate.
- The active DNS change file is `infra/aws/promty-api-ec2-dns-change.json`.

Check DNS:

```bash
dig promty.org
dig www.promty.org
dig api.promty.org
dig @1.1.1.1 +short api.promty.org
```

Check HTTPS:

```bash
curl -I https://promty.org
curl -I https://www.promty.org
curl -i https://api.promty.org/health/ready
```

CloudFront certificate check:

```bash
aws acm list-certificates \
  --profile promty-prod \
  --region us-east-1
```

## AWS Resource Checks

Check EC2 instance:

```bash
aws ec2 describe-instances \
  --profile promty-prod \
  --region ap-southeast-2 \
  --instance-ids i-066ab5e01b9685b6a \
  --query "Reservations[0].Instances[0].{State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Type:InstanceType}"
```

Check SSM connectivity:

```bash
aws ssm describe-instance-information \
  --profile promty-prod \
  --region ap-southeast-2 \
  --filters Key=InstanceIds,Values=i-066ab5e01b9685b6a
```

Check Docker containers on EC2:

```bash
aws ssm send-command \
  --profile promty-prod \
  --region ap-southeast-2 \
  --instance-ids i-066ab5e01b9685b6a \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["docker ps","docker logs --tail 80 promty-backend","docker logs --tail 80 promty-caddy"]'
```

Check ECR image tags:

```bash
aws ecr describe-images \
  --profile promty-prod \
  --region ap-southeast-2 \
  --repository-name promty/backend \
  --query "sort_by(imageDetails,& imagePushedAt)[-5:].imageTags"
```

Check frontend bucket:

```bash
aws s3 ls s3://promty-prod-frontend-435917083683 --profile promty-prod
```

Check CloudFront distribution:

```bash
aws cloudfront get-distribution \
  --profile promty-prod \
  --id E3RJ7YU3NUZQSF
```

Check database backup files:

```bash
aws s3 ls s3://promty-prod-assets-435917083683/database-backups/ \
  --profile promty-prod \
  --region ap-southeast-2
```

Confirm App Runner has no remaining services or VPC connectors:

```bash
aws apprunner list-services \
  --profile promty-prod \
  --region ap-southeast-2

aws apprunner list-vpc-connectors \
  --profile promty-prod \
  --region ap-southeast-2
```

## Manual Emergency Deploy

Use GitHub Actions for normal deployment. Manual deploy is only for emergency or
debugging.

Manual frontend deploy:

```bash
cd frontend
npm ci
VITE_PROMTY_API_URL=https://api.promty.org npm run build
aws s3 sync dist/assets s3://promty-prod-frontend-435917083683/assets --delete --profile promty-prod
aws s3 cp dist/assets s3://promty-prod-frontend-435917083683/assets \
  --recursive \
  --cache-control "public,max-age=31536000,immutable" \
  --profile promty-prod
aws s3 sync dist s3://promty-prod-frontend-435917083683 \
  --delete \
  --exclude "assets/*" \
  --exclude "index.html" \
  --cache-control "public,max-age=3600" \
  --profile promty-prod
aws s3 cp dist/index.html s3://promty-prod-frontend-435917083683/index.html \
  --cache-control "public,max-age=0,must-revalidate,s-maxage=86400" \
  --content-type "text/html" \
  --profile promty-prod
aws cloudfront create-invalidation \
  --profile promty-prod \
  --distribution-id E3RJ7YU3NUZQSF \
  --paths "/*"
```

Apply the SPA viewer-request rewrite and HTTP/3 distribution settings after
CloudFront infrastructure changes:

```bash
AWS_PROFILE_NAME=promty-prod bash infra/aws/configure-promty-cloudfront.sh
```

The rewrite sends extensionless application routes such as `/about` and
`/docs/collector` directly to `index.html`. Hashed files under `assets/` keep
their original paths and use a one-year immutable browser cache.

Manual backend image build and push:

```bash
aws ecr get-login-password \
  --profile promty-prod \
  --region ap-southeast-2 \
  | docker login \
      --username AWS \
      --password-stdin 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com

docker build \
  --platform linux/amd64 \
  -f backend/Dockerfile \
  -t 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend:latest \
  .

docker push 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend:latest
```

Manual backend EC2 restart from latest ECR image:

```bash
aws ssm send-command \
  --profile promty-prod \
  --region ap-southeast-2 \
  --instance-ids i-066ab5e01b9685b6a \
  --document-name AWS-RunShellScript \
  --parameters 'commands=[
    "aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com",
    "docker pull 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend:latest",
    "docker rm -f promty-memory-worker || true",
    "docker rm -f promty-backend || true",
    "docker run -d --name promty-backend --restart unless-stopped --network promty --env-file /opt/promty/backend.env -e PROMTY_ADMIN_GITHUB_IDS=191438254 -e PROMTY_DATABASE_POOL_SIZE=5 -e PROMTY_DATABASE_MAX_OVERFLOW=2 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend:latest",
    "sleep 8",
    "docker exec promty-backend python -c \"import urllib.request; print(urllib.request.urlopen('\''http://127.0.0.1:8011/health/ready'\'', timeout=5).read().decode())\"",
    "docker run -d --name promty-memory-worker --restart unless-stopped --network promty --env-file /opt/promty/backend.env -e PROMTY_DATABASE_POOL_SIZE=2 -e PROMTY_DATABASE_MAX_OVERFLOW=1 435917083683.dkr.ecr.ap-southeast-2.amazonaws.com/promty/backend:latest python -m app.workers.project_memory"
  ]'
```

## Database Backup And Restore

Run a manual backup:

```bash
aws ssm send-command \
  --profile promty-prod \
  --region ap-southeast-2 \
  --instance-ids i-066ab5e01b9685b6a \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["sudo /usr/local/bin/promty-db-backup"]'
```

Check backup timer:

```bash
aws ssm send-command \
  --profile promty-prod \
  --region ap-southeast-2 \
  --instance-ids i-066ab5e01b9685b6a \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["systemctl is-active promty-db-backup.timer","systemctl list-timers promty-db-backup.timer --no-pager"]'
```

Restore a backup onto EC2 only during a controlled maintenance window. The basic
shape is:

```text
1. stop promty-backend
2. download the selected S3 dump
3. restore into promty-postgres with pg_restore
4. restart promty-backend
5. verify /health/ready and one user flow
```

## GitHub OAuth Configuration

The GitHub OAuth app must use:

```text
Homepage URL: https://promty.org
Authorization callback URL: https://api.promty.org/api/auth/github/callback
```

Production OAuth environment:

```text
PROMTY_GITHUB_CLIENT_ID=stored in Secrets Manager
PROMTY_GITHUB_CLIENT_SECRET=stored in Secrets Manager
PROMTY_API_PUBLIC_URL=https://api.promty.org
PROMTY_APP_URL=https://promty.org
PROMTY_CORS_ORIGINS=https://promty.org,https://www.promty.org
PROMTY_SESSION_COOKIE_SECURE=true
PROMTY_SESSION_COOKIE_SAMESITE=lax
```

If GitHub login returns:

```json
{"detail":"GitHub token exchange failed"}
```

Check these in order:

1. GitHub OAuth client id and secret in Secrets Manager are correct.
2. OAuth callback URL exactly matches `https://api.promty.org/api/auth/github/callback`.
3. EC2 can reach GitHub over outbound HTTPS.
4. `/opt/promty/backend.env` has the current OAuth values.
5. `promty-backend` was restarted after secret changes.
6. Backend logs do not show DNS, TLS, or GitHub API errors.

## Collector Production Install Command

The user-facing install command should not contain a personal username.

Preferred production command:

```bash
npx promty-collector init --tool codex-cli --app-url https://promty.org --api-url https://api.promty.org
```

For local development:

```bash
npx promty-collector init --tool codex-cli --app-url http://127.0.0.1:5173 --api-url http://127.0.0.1:8011
```

The npm package release is separate from AWS deployment. Before publishing:

```bash
cd collector
npm pack --dry-run
```

Publishing to npm requires an npm account with publish permission and may require
OTP or recovery-code handling:

```bash
npm publish --access public
```

## Post-Deploy Verification

After every production deploy:

```bash
curl -i https://api.promty.org/health/ready
curl -I https://promty.org
curl -I https://www.promty.org
```

Then check the app manually:

1. Open `https://promty.org`.
2. Sign in with GitHub.
3. Confirm `/api/auth/me` succeeds through the browser session.
4. Open a project list.
5. Open a project detail page.
6. If a collector token is needed, run the production collector install command.
7. Confirm new events appear in the project.

Deployment is not complete until API readiness, the memory worker, frontend, login, and one
core user flow work.

## Common Troubleshooting

Frontend still shows an old version:

- confirm `AWS Deploy` finished successfully
- check the S3 sync step
- check CloudFront invalidation status
- hard refresh the browser

API health check fails:

- check EC2 instance state
- check SSM connectivity
- check `docker ps` on EC2
- check `promty-backend` logs
- check `promty-caddy` logs
- verify the latest ECR image exists
- verify database migration did not fail during container start

Login redirects or loops:

- check `PROMTY_APP_URL`
- check `PROMTY_API_PUBLIC_URL`
- check `PROMTY_CORS_ORIGINS`
- check cookie settings
- check GitHub OAuth callback URL

GitHub token exchange fails:

- verify OAuth secrets
- verify EC2 outbound internet
- restart `promty-backend` after secret changes

Database connection fails:

- verify `promty-postgres` is running
- verify `/opt/promty/backend.env` points to `promty-postgres`
- check available disk space on EC2
- check backend logs for migration failures

S3 asset upload fails:

- verify `PROMTY_PUBLISHED_FLOW_ASSET_STORAGE=s3`
- verify bucket name and region
- verify the EC2 instance role can access the private asset bucket

GitHub Actions cannot assume AWS role:

- check `AWS_ROLE_TO_ASSUME`
- check the IAM OIDC provider for `token.actions.githubusercontent.com`
- check `infra/aws/promty-github-actions-trust.json`
- check the GitHub repository name in the trust policy

GitHub Actions cannot deploy to EC2:

- check `AWS_EC2_INSTANCE_ID`
- check EC2 SSM online status
- check `infra/aws/promty-github-actions-policy.json`
- check the workflow SSM command output

## Cost-Sensitive Operations

The current low-cost baseline depends on keeping these choices:

- one small EC2 instance for API plus Postgres
- one EC2 Elastic IP for `api.promty.org`
- no NAT Gateway
- no running RDS instance
- App Runner deleted
- backups in S3 instead of a running managed database

Do not recreate NAT Gateway, App Runner active service, or RDS unless the extra
monthly cost is intentional.

## Updating This Runbook

Update this document and [aws-resource-inventory.md](aws-resource-inventory.md)
whenever any of these change:

- domain names
- hosted zone IDs
- certificate ARNs
- S3 bucket names
- CloudFront distribution ID
- ECR repository
- EC2 instance ID
- EC2 Elastic IP
- GitHub repository name
- GitHub Actions secret names
- backend runtime variables
- Secrets Manager secret names

If an AWS JSON snapshot changes under `infra/aws`, update the matching section in
the inventory file in the same PR.
