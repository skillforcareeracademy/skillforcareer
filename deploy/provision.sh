#!/usr/bin/env bash
#
# Prepare a bare Ubuntu box to serve the academy's site. Run once, as root, on
# the VPS:
#
#   bash provision.sh www.skillforcareer.com
#
# Before the domain is moved, provision a preview instead — the site on a port
# of its own, no DNS and no certificate needed:
#
#   SKIP_TLS=1 PREVIEW_PORT=8080 bash provision.sh preview
#
# It installs node, nginx and certbot, makes the directories a release lands
# in, and writes the service files. It never clones anything: the code arrives
# from a laptop via scripts/deploy-vps.sh, and the repository stays in GitHub.
set -euo pipefail

DOMAIN="${1:-}"
NODE_VERSION="${NODE_VERSION:-24.9.0}"
APP_PORT="${APP_PORT:-3000}"
# A firewall is off by default: this box may already be serving another site,
# and turning one on is the owner's decision, not this script's.
ENABLE_UFW="${ENABLE_UFW:-0}"
# Set SKIP_TLS=1 to serve the site on PREVIEW_PORT over plain HTTP instead of
# taking a certificate for a domain that may not point here yet.
SKIP_TLS="${SKIP_TLS:-0}"
PREVIEW_PORT="${PREVIEW_PORT:-8080}"
ROOT=/var/www/skillforcareer

[[ $EUID -eq 0 ]] || { echo "Run this as root." >&2; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Usage: bash provision.sh <domain>" >&2; exit 1; }

echo "▸ packages"
export DEBIAN_FRONTEND=noninteractive
missing=""
for pkg in nginx certbot python3-certbot-nginx rsync curl xz-utils; do
  dpkg -s "$pkg" >/dev/null 2>&1 || missing="$missing $pkg"
done
if [[ -n "$missing" ]]; then
  apt-get update -qq
  # shellcheck disable=SC2086
  apt-get install -y -qq $missing
else
  echo "  already installed"
fi

echo "▸ node $NODE_VERSION"
if ! node -v 2>/dev/null | grep -q "^v${NODE_VERSION%%.*}\."; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" -o "$tmp/node.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C /usr/local --strip-components=1
  rm -rf "$tmp"
fi
# Wherever node came from, the unit expects it here.
[[ -x /usr/local/bin/node ]] || ln -sfn "$(command -v node)" /usr/local/bin/node
node -v

echo "▸ directories"
mkdir -p "$ROOT/releases" /etc/skillforcareer /var/www/certbot
# Uploads and generated files that must outlive a release.
mkdir -p "$ROOT/shared/storage"
chown -R www-data:www-data "$ROOT" /var/www/certbot
chmod 750 /etc/skillforcareer

if [[ ! -f /etc/skillforcareer/app.env ]]; then
  cat > /etc/skillforcareer/app.env <<'ENV'
# Secrets for the site. Root-readable only; nothing here is ever committed.
# Fill every value before starting the service.
PORT=__APP_PORT__
HOSTNAME=127.0.0.1
DATABASE_URL=
AUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://www.skillforcareer.com
ENV
  sed -i "s/__APP_PORT__/$APP_PORT/" /etc/skillforcareer/app.env
  chmod 600 /etc/skillforcareer/app.env
  echo "  wrote /etc/skillforcareer/app.env — fill it in before starting the service"
fi

echo "▸ services"
install -m 644 "$(dirname "$0")/skillforcareer.service" /etc/systemd/system/skillforcareer.service
if [[ -f "$(dirname "$0")/skillforcareer-signal.service" ]]; then
  install -m 644 "$(dirname "$0")/skillforcareer-signal.service" /etc/systemd/system/skillforcareer-signal.service
fi
systemctl daemon-reload
systemctl enable skillforcareer >/dev/null

if [[ "$SKIP_TLS" == "1" ]]; then
  echo "▸ nginx preview on :$PREVIEW_PORT"
  sed -e "s/PREVIEW_PORT/$PREVIEW_PORT/g" -e "s/APP_PORT/$APP_PORT/g" \
    "$(dirname "$0")/nginx-preview.conf" > /etc/nginx/sites-available/skillforcareer-preview
  ln -sfn /etc/nginx/sites-available/skillforcareer-preview \
    /etc/nginx/sites-enabled/skillforcareer-preview
else
  echo "▸ nginx for $DOMAIN"
  sed -e "s/SERVER_NAME/$DOMAIN/g" -e "s/APP_PORT/$APP_PORT/g" \
    "$(dirname "$0")/nginx.conf" > /etc/nginx/sites-available/skillforcareer
  ln -sfn /etc/nginx/sites-available/skillforcareer /etc/nginx/sites-enabled/skillforcareer
fi
# Only the stock placeholder site goes; anything else here belongs to someone.
[[ -L /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default

if [[ "$ENABLE_UFW" == "1" ]]; then
  echo "▸ firewall"
  apt-get install -y -qq ufw
  ufw allow OpenSSH >/dev/null
  ufw allow 'Nginx Full' >/dev/null
  ufw --force enable >/dev/null
fi

# nginx won't start until the certificate exists, so get it over plain http
# first with the site's http block only.
if [[ "$SKIP_TLS" != "1" && ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  echo "▸ certificate"
  cat > /etc/nginx/sites-available/skillforcareer-bootstrap <<BOOT
server {
  listen 80;
  server_name $DOMAIN;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 200 'provisioning'; add_header Content-Type text/plain; }
}
BOOT
  ln -sfn /etc/nginx/sites-available/skillforcareer-bootstrap /etc/nginx/sites-enabled/skillforcareer-bootstrap
  rm -f /etc/nginx/sites-enabled/skillforcareer
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --agree-tos --register-unsafely-without-email --non-interactive || {
    echo "certbot failed — is $DOMAIN pointed at this server yet?" >&2
    exit 1
  }
  rm -f /etc/nginx/sites-enabled/skillforcareer-bootstrap
  ln -sfn /etc/nginx/sites-available/skillforcareer /etc/nginx/sites-enabled/skillforcareer
fi

nginx -t && systemctl reload nginx

cat <<DONE

Provisioned. Two things left:
  1. Fill /etc/skillforcareer/app.env (the same values the Vercel project uses).
  2. From the laptop: ./scripts/deploy-vps.sh
DONE
