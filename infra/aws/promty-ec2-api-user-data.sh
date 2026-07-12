#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/promty-bootstrap.log | logger -t promty-bootstrap -s 2>/dev/console) 2>&1

AWS_REGION="ap-southeast-2"
AWS_ACCOUNT_ID="435917083683"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_REGISTRY}/promty/backend:latest"
APP_DIR="/opt/promty"
BACKUP_BUCKET="promty-prod-assets-435917083683"

fetch_secret() {
  aws secretsmanager get-secret-value \
    --region "${AWS_REGION}" \
    --secret-id "$1" \
    --query SecretString \
    --output text
}

write_env() {
  local name="$1"
  local value="$2"
  printf "%s=%s\n" "${name}" "${value}" >> "${APP_DIR}/backend.env"
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
PROMPTHUB_API_PUBLIC_URL=https://api.promty.org
PROMPTHUB_APP_URL=https://promty.org
PROMPTHUB_CORS_ORIGINS=https://promty.org,https://www.promty.org
PROMPTHUB_SESSION_COOKIE_SECURE=true
PROMPTHUB_SESSION_COOKIE_SAMESITE=lax
PROMPTHUB_PUBLISHED_FLOW_ASSET_STORAGE=s3
PROMPTHUB_AWS_REGION=${AWS_REGION}
PROMPTHUB_AWS_S3_BUCKET=${BACKUP_BUCKET}
PROMPTHUB_AWS_S3_PREFIX=published-flow-assets
PROMPTHUB_APP_ENCRYPTION_KEY_ID=aws-prod
PROMTY_MEMORY_GENERATOR=local
PROMTY_MEMORY_DRAFT_GENERATOR=local
PROMTY_PROJECT_MEMORY_GENERATOR=local
EOF

write_env "PROMPTHUB_APP_ENCRYPTION_KEY" "$(fetch_secret promty/prod/app-encryption-key)"
write_env "PROMPTHUB_GITHUB_CLIENT_ID" "$(fetch_secret promty/prod/github-client-id)"
write_env "PROMPTHUB_GITHUB_CLIENT_SECRET" "$(fetch_secret promty/prod/github-client-secret)"
write_env "PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY" "$(fetch_secret promty/prod/github-token-encryption-key)"
write_env "PROMPTHUB_OAUTH_STATE_SECRET" "$(fetch_secret promty/prod/oauth-state-secret)"
write_env "PROMPTHUB_JWT_SECRET" "$(fetch_secret promty/prod/jwt-secret)"
write_env "PROMPTHUB_API_TOKEN" "$(fetch_secret promty/prod/global-ingest-token)"
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

until docker exec promty-postgres pg_isready -U promty_admin -d promty; do
  sleep 2
done

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
  "${BACKEND_IMAGE}"

cat > "${APP_DIR}/Caddyfile" <<'EOF'
:80 {
  redir https://api.promty.org{uri} 308
}

api.promty.org {
  encode gzip
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

for attempt in {1..30}; do
  if docker exec promty-backend python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8011/health', timeout=5).read().decode())"; then
    echo "Promty EC2 bootstrap complete"
    exit 0
  fi
  sleep 2
done

docker logs --tail 80 promty-backend || true
docker logs --tail 80 promty-caddy || true
docker exec promty-backend python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8011/health', timeout=5).read().decode())"
echo "Promty EC2 bootstrap complete"
