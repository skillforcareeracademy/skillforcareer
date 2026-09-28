#!/usr/bin/env bash
#
# Prepare a bare Ubuntu box to serve the academy's site. Run once, as root, on
# the VPS:
#
#   bash provision.sh www.skillforcareer.com
#
# It installs node, nginx and certbot, makes the directories a release lands
# in, and writes the service files. It never clones anything: the code arrives
# from a laptop via scripts/deploy-vps.sh, and the repository stays in GitHub.
set -euo pipefail

DOMAIN="${1:-}"
NODE_VERSION="${NODE_VERSION:-24.9.0}"
ROOT=/var/www/skillforcareer

[[ $EUID -eq 0 ]] || { echo "Run this as root." >&2; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Usage: bash provision.sh <domain>" >&2; exit 1; }

echo "▸ packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx rsync curl xz-utils ufw

echo "▸ node $NODE_VERSION"
if ! node -v 2>/dev/null | grep -q "^v${NODE_VERSION%%.*}\."; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" -o "$tmp/node.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C /usr/local --strip-components=1
  rm -rf "$tmp"
  ln -sfn /usr/local/bin/node /usr/bin/node
fi
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
DATABASE_URL=
AUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://www.skillforcareer.com
ENV
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

echo "▸ nginx for $DOMAIN"
sed "s/SERVER_NAME/$DOMAIN/g" "$(dirname "$0")/nginx.conf" > /etc/nginx/sites-available/skillforcareer
ln -sfn /etc/nginx/sites-available/skillforcareer /etc/nginx/sites-enabled/skillforcareer
rm -f /etc/nginx/sites-enabled/default

echo "▸ firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

# nginx won't start until the certificate exists, so get it over plain http
# first with the site's http block only.
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
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
