#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/promty-bootstrap.log | logger -t promty-bootstrap -s 2>/dev/console) 2>&1

AWS_REGION="ap-southeast-2"
AWS_ACCOUNT_ID="435917083683"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_REGISTRY}/promty/backend:latest"
APP_DIR="/opt/promty"
BACKUP_BUCKET="promty-prod-assets-435917083683"
POSTGRES_READY_MAX_ATTEMPTS=30
POSTGRES_READY_PROBE_TIMEOUT_SECONDS=2
BACKEND_READY_MAX_ATTEMPTS=30
BACKEND_READY_PROBE_TIMEOUT_SECONDS=5
READY_RETRY_DELAY_SECONDS=2

fetch_secret() {
  aws secretsmanager get-secret-value \
    --region "${AWS_REGION}" \
    --secret-id "$1" \
    --query SecretString \
    --output text
}

fetch_previous_secret() {
  aws secretsmanager get-secret-value \
    --region "${AWS_REGION}" \
    --secret-id "$1" \
    --version-stage AWSPREVIOUS \
    --query SecretString \
    --output text \
    2>/dev/null || true
}

fetch_optional_secret() {
  aws secretsmanager get-secret-value \
    --region "${AWS_REGION}" \
    --secret-id "$1" \
    --query SecretString \
    --output text \
    2>/dev/null || true
}

write_env() {
  local name="$1"
  local value="$2"
  printf "%s=%s\n" "${name}" "${value}" >> "${APP_DIR}/backend.env"
}

wait_for_postgres() {
  local attempt
  for ((attempt = 1; attempt <= POSTGRES_READY_MAX_ATTEMPTS; attempt++)); do
    if docker exec promty-postgres pg_isready \
      -U promty_admin \
      -d promty \
      -t "${POSTGRES_READY_PROBE_TIMEOUT_SECONDS}" >/dev/null 2>&1; then
      echo "PostgreSQL is ready after ${attempt} attempt(s)"
      return 0
    fi
    if ((attempt < POSTGRES_READY_MAX_ATTEMPTS)); then
      sleep "${READY_RETRY_DELAY_SECONDS}"
    fi
  done

  echo "ERROR: PostgreSQL readiness failed after ${POSTGRES_READY_MAX_ATTEMPTS} attempts (probe timeout ${POSTGRES_READY_PROBE_TIMEOUT_SECONDS}s, retry delay ${READY_RETRY_DELAY_SECONDS}s)" >&2
  return 1
}

wait_for_backend() {
  local phase="$1"
  local attempt
  for ((attempt = 1; attempt <= BACKEND_READY_MAX_ATTEMPTS; attempt++)); do
    if docker exec promty-backend python -c \
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8011/health/ready', timeout=${BACKEND_READY_PROBE_TIMEOUT_SECONDS}).read()" \
      >/dev/null 2>&1; then
      echo "Backend is ready during ${phase} after ${attempt} attempt(s)"
      return 0
    fi
    if ((attempt < BACKEND_READY_MAX_ATTEMPTS)); then
      sleep "${READY_RETRY_DELAY_SECONDS}"
    fi
  done

  echo "ERROR: Backend readiness failed during ${phase} after ${BACKEND_READY_MAX_ATTEMPTS} attempts (probe timeout ${BACKEND_READY_PROBE_TIMEOUT_SECONDS}s, retry delay ${READY_RETRY_DELAY_SECONDS}s)" >&2
  return 1
}

dnf update -y
dnf install -y awscli docker
systemctl enable --now docker

mkdir -p \
  "${APP_DIR}/postgresql" \
  "${APP_DIR}/caddy-data" \
  "${APP_DIR}/caddy-config" \
  "${APP_DIR}/backups"
chmod 700 "${APP_DIR}"

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

docker network inspect promty >/dev/null 2>&1 || docker network create promty

DB_PASSWORD="$(fetch_secret promty/prod/ec2-postgres-password)"
SOURCE_DATABASE_URL="$(fetch_secret promty/prod/database-url)"
SOURCE_LIBPQ_URL="${SOURCE_DATABASE_URL/postgresql+psycopg:\/\//postgresql://}"
TARGET_LIBPQ_URL="postgresql://promty_admin:${DB_PASSWORD}@promty-postgres:5432/promty"

cat > "${APP_DIR}/backend.env" <<EOF
DATABASE_URL=postgresql+psycopg://promty_admin:${DB_PASSWORD}@promty-postgres:5432/promty
PROMTY_DATABASE_POOL_TIMEOUT_SECONDS=5
PROMTY_DATABASE_POOL_RECYCLE_SECONDS=300
PROMTY_API_PUBLIC_URL=https://api.promty.org
PROMTY_APP_URL=https://promty.org
PROMTY_CORS_ORIGINS=https://promty.org,https://www.promty.org
PROMTY_SESSION_COOKIE_SECURE=true
PROMTY_SESSION_COOKIE_SAMESITE=lax
PROMTY_ACCESS_TOKEN_TTL_SECONDS=3600
PROMTY_REFRESH_TOKEN_TTL_SECONDS=15552000
PROMTY_REFRESH_TOKEN_IDLE_TTL_SECONDS=2592000
PROMTY_REFRESH_TOKEN_ROTATION_GRACE_SECONDS=30
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
PROMTY_SUPPORT_RATE_LIMIT_REQUESTS=5
PROMTY_SUPPORT_RATE_LIMIT_WINDOW_SECONDS=300
PROMTY_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMTY_AWS_REGION=${AWS_REGION}
PROMTY_AWS_S3_BUCKET=${BACKUP_BUCKET}
PROMTY_AWS_S3_PREFIX=published-flow-assets
PROMTY_APP_ENCRYPTION_KEY_ID=aws-prod
PROMTY_MEMORY_GENERATOR=openai
PROMTY_MEMORY_DRAFT_GENERATOR=openai
PROMTY_PROJECT_MEMORY_GENERATOR=openai
EOF

OPENAI_API_KEY="$(fetch_optional_secret promty/prod/openai-api-key)"
if [ -n "${OPENAI_API_KEY}" ]; then
  write_env "PROMTY_OPENAI_API_KEY" "${OPENAI_API_KEY}"
fi
write_env "PROMTY_APP_ENCRYPTION_KEY" "$(fetch_secret promty/prod/app-encryption-key)"
APP_ENCRYPTION_PREVIOUS_KEY="$(fetch_previous_secret promty/prod/app-encryption-key)"
if [ -n "${APP_ENCRYPTION_PREVIOUS_KEY}" ]; then
  write_env "PROMTY_APP_ENCRYPTION_PREVIOUS_KEYS" "${APP_ENCRYPTION_PREVIOUS_KEY}"
fi
write_env "PROMTY_GITHUB_CLIENT_ID" "$(fetch_secret promty/prod/github-client-id)"
SUPPORT_NOTIFICATION_EMAIL="$(fetch_optional_secret promty/prod/support-notification-email)"
if [ -n "${SUPPORT_NOTIFICATION_EMAIL}" ]; then
  write_env "PROMTY_SUPPORT_NOTIFICATION_EMAILS" "${SUPPORT_NOTIFICATION_EMAIL}"
fi
write_env "PROMTY_GITHUB_CLIENT_SECRET" "$(fetch_secret promty/prod/github-client-secret)"
write_env "PROMTY_GITHUB_TOKEN_ENCRYPTION_KEY" "$(fetch_secret promty/prod/github-token-encryption-key)"
GITHUB_TOKEN_ENCRYPTION_PREVIOUS_KEY="$(fetch_previous_secret promty/prod/github-token-encryption-key)"
if [ -n "${GITHUB_TOKEN_ENCRYPTION_PREVIOUS_KEY}" ]; then
  write_env \
    "PROMTY_GITHUB_TOKEN_ENCRYPTION_PREVIOUS_KEYS" \
    "${GITHUB_TOKEN_ENCRYPTION_PREVIOUS_KEY}"
fi
write_env "PROMTY_OAUTH_STATE_SECRET" "$(fetch_secret promty/prod/oauth-state-secret)"
write_env "PROMTY_JWT_SECRET" "$(fetch_secret promty/prod/jwt-secret)"
write_env "PROMTY_API_TOKEN" "$(fetch_secret promty/prod/global-ingest-token)"
chmod 600 "${APP_DIR}/backend.env"

docker pull postgres:18-alpine
docker pull caddy:2-alpine
docker pull "${BACKEND_IMAGE}"

docker rm -f promty-postgres >/dev/null 2>&1 || true
docker run -d \
  --name promty-postgres \
  --restart unless-stopped \
  --network promty \
  -e POSTGRES_DB=promty \
  -e POSTGRES_USER=promty_admin \
  -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
  -v "${APP_DIR}/postgresql:/var/lib/postgresql" \
  postgres:18-alpine

if ! wait_for_postgres; then
  docker logs --tail 80 promty-postgres || true
  exit 1
fi

if [ ! -f "${APP_DIR}/.rds-restored" ]; then
  docker run --rm \
    --network promty \
    -e SOURCE_DATABASE_URL="${SOURCE_LIBPQ_URL}" \
    -e TARGET_DATABASE_URL="${TARGET_LIBPQ_URL}" \
    postgres:18-alpine \
    sh -ec 'pg_dump "$SOURCE_DATABASE_URL" | psql "$TARGET_DATABASE_URL"'
  touch "${APP_DIR}/.rds-restored"
fi

docker rm -f promty-backend >/dev/null 2>&1 || true
docker run -d \
  --name promty-backend \
  --restart unless-stopped \
  --network promty \
  --env-file "${APP_DIR}/backend.env" \
  -e PROMTY_PUBLISHED_FLOWS_ENABLED=true \
  -e PROMTY_DATABASE_POOL_SIZE=5 \
  -e PROMTY_DATABASE_MAX_OVERFLOW=2 \
  "${BACKEND_IMAGE}"

if ! wait_for_backend "initial startup"; then
  docker logs --tail 80 promty-backend || true
  exit 1
fi

docker rm -f promty-memory-worker >/dev/null 2>&1 || true
docker run -d \
  --name promty-memory-worker \
  --restart unless-stopped \
  --network promty \
  --env-file "${APP_DIR}/backend.env" \
  --health-cmd "python -m app.workers.healthcheck" \
  --health-interval 10s \
  --health-timeout 3s \
  --health-retries 3 \
  --health-start-period 10s \
  -e PROMTY_PUBLISHED_FLOWS_ENABLED=true \
  -e PROMTY_DATABASE_POOL_SIZE=2 \
  -e PROMTY_DATABASE_MAX_OVERFLOW=1 \
  "${BACKEND_IMAGE}" \
  python -m app.workers.project_memory

cat > "${APP_DIR}/Caddyfile" <<'EOF'
:80 {
  redir https://api.promty.org{uri} 308
}

api.promty.org {
  encode gzip
  request_body {
    max_size 32MB
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    X-Frame-Options "DENY"
  }
  reverse_proxy promty-backend:8011
}
EOF

docker rm -f promty-caddy >/dev/null 2>&1 || true
docker run -d \
  --name promty-caddy \
  --restart unless-stopped \
  --network promty \
  -p 80:80 \
  -p 443:443 \
  -v "${APP_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "${APP_DIR}/caddy-data:/data" \
  -v "${APP_DIR}/caddy-config:/config" \
  caddy:2-alpine

cat > /usr/local/bin/promty-db-backup <<'EOF'
#!/bin/bash
set -euo pipefail

AWS_REGION="ap-southeast-2"
APP_DIR="/opt/promty"
BACKUP_BUCKET="promty-prod-assets-435917083683"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="${APP_DIR}/backups/promty-${STAMP}.dump"

DB_PASSWORD="$(aws secretsmanager get-secret-value \
  --region "${AWS_REGION}" \
  --secret-id promty/prod/ec2-postgres-password \
  --query SecretString \
  --output text)"

docker run --rm \
  --network promty \
  -e PGPASSWORD="${DB_PASSWORD}" \
  -v "${APP_DIR}/backups:/backups" \
  postgres:18-alpine \
  pg_dump -h promty-postgres -U promty_admin -d promty -Fc -f "/backups/promty-${STAMP}.dump"

aws s3 cp "${BACKUP_PATH}" "s3://${BACKUP_BUCKET}/database-backups/promty-${STAMP}.dump" \
  --region "${AWS_REGION}"
rm -f "${BACKUP_PATH}"
EOF
chmod 700 /usr/local/bin/promty-db-backup

cat > /etc/systemd/system/promty-db-backup.service <<'EOF'
[Unit]
Description=Promty Postgres backup to S3

[Service]
Type=oneshot
ExecStart=/usr/local/bin/promty-db-backup
EOF

cat > /etc/systemd/system/promty-db-backup.timer <<'EOF'
[Unit]
Description=Run Promty Postgres backup daily

[Timer]
OnCalendar=*-*-* 03:17:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now promty-db-backup.timer

if ! wait_for_backend "final bootstrap verification"; then
  docker logs --tail 80 promty-backend || true
  docker logs --tail 80 promty-caddy || true
  exit 1
fi

echo "Promty EC2 bootstrap complete"
