#!/usr/bin/env bash
#
# Put the site live on the academy's own VPS.
#
# What travels: the compiled server, the generated Prisma client, the built
# assets and /public. What never travels: the repository, its history, the
# source we author, the notes and the .env — the code lives in GitHub and
# nowhere else. A release goes into its own dated folder and only then does
# `current` swing over, so a bad build can be rolled back by moving a symlink.
#
#   ./scripts/deploy-vps.sh              # build, then ship
#   ./scripts/deploy-vps.sh --no-build   # ship the build already on disk
#
set -euo pipefail

VPS_HOST="${VPS_HOST:-187.127.181.146}"
VPS_USER="${VPS_USER:-root}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/sfc_vps}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/skillforcareer}"
SERVICE="${SERVICE:-skillforcareer}"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SSH=(ssh -i "$VPS_KEY" -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST")

# The standalone build is opt-in, so the hosted deployment is untouched.
export SFC_VPS_BUILD=1

if [[ "${1:-}" != "--no-build" ]]; then
  echo "▸ building"
  npm run build
fi

[[ -d .next/standalone ]] || { echo "No .next/standalone — run without --no-build." >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
echo "▸ staging into $STAGE"

# The server bundle, copied whole and then pruned. (macOS ships openrsync,
# whose include/exclude ordering is not rsync's, so pruning by hand is the only
# way to be sure of what leaves this machine.)
cp -R .next/standalone/. "$STAGE/"

# Everything that is ours rather than the site's. src/generated/prisma stays —
# that is the generated database client the server loads at runtime.
rm -rf \
  "$STAGE/.env" "$STAGE"/.env.* \
  "$STAGE/CLAUDE.md" "$STAGE/AGENTS.md" "$STAGE/.claude" \
  "$STAGE/README.md" "$STAGE/docs" "$STAGE/.git" \
  "$STAGE/scripts" "$STAGE/certificates" "$STAGE/render.yaml" \
  "$STAGE/eslint.config.mjs" "$STAGE/components.json" \
  "$STAGE/tsconfig.json" "$STAGE/tsconfig.tsbuildinfo" \
  "$STAGE/prisma" "$STAGE/prisma.config.ts" "$STAGE/vercel.json"
find "$STAGE/src" -mindepth 1 -maxdepth 1 ! -name generated -exec rm -rf {} +
find "$STAGE/src/generated" -mindepth 1 -maxdepth 1 ! -name prisma -exec rm -rf {} +

# Next leaves these two for us to place by hand.
mkdir -p "$STAGE/.next/static"
cp -R .next/static/. "$STAGE/.next/static/"
mkdir -p "$STAGE/public"
cp -R public/. "$STAGE/public/"

# A belt-and-braces sweep: nothing of ours may reach the client's machine.
if find "$STAGE" -maxdepth 3 \( -name 'CLAUDE.md' -o -name 'AGENTS.md' -o -name '.env' -o -name '.git' \) -print -quit | grep -q .; then
  echo "Refusing to deploy: private files are still in the staged build." >&2
  exit 1
fi
[[ -f "$STAGE/server.js" && -d "$STAGE/src/generated/prisma" && -d "$STAGE/.next/static" ]] || {
  echo "Refusing to deploy: the staged build is incomplete." >&2; exit 1; }
echo "  staged $(du -sh "$STAGE" | cut -f1)"

RELEASE="$(date +%Y%m%d%H%M%S)"
echo "▸ shipping release $RELEASE to $VPS_USER@$VPS_HOST"
"${SSH[@]}" "mkdir -p $REMOTE_ROOT/releases/$RELEASE"
rsync -az --delete -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new" \
  "$STAGE/" "$VPS_USER@$VPS_HOST:$REMOTE_ROOT/releases/$RELEASE/"

echo "▸ switching over"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
ln -sfn $REMOTE_ROOT/releases/$RELEASE $REMOTE_ROOT/current.new
mv -Tf $REMOTE_ROOT/current.new $REMOTE_ROOT/current
chown -R www-data:www-data $REMOTE_ROOT/releases/$RELEASE
systemctl restart $SERVICE
# Keep the last five releases; older ones are dead weight.
ls -1dt $REMOTE_ROOT/releases/*/ | tail -n +6 | xargs -r rm -rf
sleep 3
systemctl is-active --quiet $SERVICE && echo "service up" || { journalctl -u $SERVICE -n 40 --no-pager; exit 1; }
REMOTE

echo "▸ checking the site answers"
for i in 1 2 3 4 5 6 7 8 9 10; do
  code="$("${SSH[@]}" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health || true")"
  [[ "$code" == "200" ]] && { echo "live (health 200)"; exit 0; }
  sleep 3
done
echo "The service is running but /api/health did not answer 200 — check the logs." >&2
exit 1
