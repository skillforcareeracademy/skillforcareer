#!/usr/bin/env bash
# Set up a TURN relay (coturn) for skillforcareer.com live classes.
# Run as root on the VPS:  sudo bash setup-turn.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
echo "▸ Installing coturn…"
apt-get update -y
apt-get install -y coturn openssl curl

# This server's public address (needed when the VPS is behind 1:1 NAT).
PUBLIC_IP="$(curl -s -4 --max-time 10 ifconfig.me || true)"
[ -z "$PUBLIC_IP" ] && PUBLIC_IP="$(hostname -I | awk '{print $1}')"

# One shared secret, kept so re-running the script doesn't change it.
SECRET_FILE=/etc/turn_shared_secret
if [ -f "$SECRET_FILE" ]; then
  SECRET="$(cat "$SECRET_FILE")"
else
  SECRET="$(openssl rand -hex 32)"
  printf '%s' "$SECRET" > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
fi

echo "▸ Writing /etc/turnserver.conf…"
cat > /etc/turnserver.conf <<CONF
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=${SECRET}
realm=skillforcareer.com
server-name=skillforcareer.com
external-ip=${PUBLIC_IP}
min-port=49152
max-port=65535
no-cli
no-tlsv1
no-tlsv1_1
no-multicast-peers
stale-nonce=600
no-loopback-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
log-file=/var/log/turnserver.log
CONF

# Let the Debian/Ubuntu service actually start.
if grep -q '^#*TURNSERVER_ENABLED=' /etc/default/coturn 2>/dev/null; then
  sed -i 's/^#*TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
else
  echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi

echo "▸ Opening the firewall…"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 3478/udp
  ufw allow 3478/tcp
  ufw allow 49152:65535/udp
  echo "  (ufw rules added)"
else
  echo "  ufw not active — make sure your provider's firewall allows:"
  echo "    UDP 3478, TCP 3478, and UDP 49152-65535 inbound"
fi

echo "▸ Starting coturn…"
systemctl enable coturn >/dev/null 2>&1 || true
systemctl restart coturn
sleep 2

echo
if systemctl is-active --quiet coturn; then
  echo "✅ coturn is running."
else
  echo "⚠️  coturn did not start — last log lines:"
  journalctl -u coturn -n 20 --no-pager || true
fi

echo
echo "=================================================================="
echo " Set these in Vercel → Project → Settings → Environment Variables"
echo " (Production), then redeploy:"
echo
echo "   TURN_URLS=turn:${PUBLIC_IP}:3478,turn:${PUBLIC_IP}:3478?transport=tcp"
echo "   TURN_SHARED_SECRET=${SECRET}"
echo
echo " After redeploy, /api/live/ice returns hasTurn:true and live"
echo " classes connect instead of hanging on 'Connecting'."
echo "=================================================================="
