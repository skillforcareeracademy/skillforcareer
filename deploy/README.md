# Running the site on the academy's VPS

The site can run on the academy's own server instead of (or alongside) the
hosted deployment. Only the **built** site goes there — the compiled server, the
generated database client, the static assets and `/public`. The repository, its
history, the source we author and the `.env` never leave GitHub, so the server
holds a running website and nothing that could be used as a copy of the project.

```
GitHub  ──(the code, the history, the only backup)
  │
  └── laptop ──(built output only)──▶ VPS ──▶ nginx ──▶ node
```

## The parts

| File | What it does |
| --- | --- |
| `deploy/provision.sh` | One-time: node, nginx, certbot, firewall, directories, service files, TLS certificate. |
| `deploy/skillforcareer.service` | systemd unit for the site (`node server.js` on `127.0.0.1:3000`). |
| `deploy/skillforcareer-signal.service` | systemd unit for the live-class signalling socket, if this box runs it. |
| `deploy/nginx.conf` | TLS in front, proxy to node, hashed assets cached hard. |
| `scripts/deploy-vps.sh` | Build, prune, ship a dated release, switch `current`, restart, health-check. |

## First time

1. **Give the laptop a key.** The server accepts public keys only — the hPanel
   root password is not an SSH password. Add the deploy key's public half in
   hPanel → VPS → SSH keys (or append it to `/root/.ssh/authorized_keys` from
   the browser console), then check:

   ```bash
   ssh -i ~/.ssh/sfc_vps root@187.127.181.146 'echo ok'
   ```

2. **Provision the box.** Copy the four files across and run the script with the
   domain that will point at this server:

   ```bash
   scp -i ~/.ssh/sfc_vps deploy/* root@187.127.181.146:/root/deploy/
   ssh -i ~/.ssh/sfc_vps root@187.127.181.146 'bash /root/deploy/provision.sh www.skillforcareer.com'
   ```

   The certificate step needs the domain's A record already pointing at
   `187.127.181.146`; until then, provision with the server's own hostname and
   re-run for the real domain when DNS has moved.

3. **Fill in the secrets** — the same values the hosted project uses, in
   `/etc/skillforcareer/app.env` (root-readable only, never committed):

   ```bash
   ssh -i ~/.ssh/sfc_vps root@187.127.181.146 'nano /etc/skillforcareer/app.env'
   ```

4. **Ship it.**

   ```bash
   ./scripts/deploy-vps.sh
   ```

## Every time after that

```bash
./scripts/deploy-vps.sh              # build, then ship
./scripts/deploy-vps.sh --no-build   # ship the build already on disk
```

A release lands in `/var/www/skillforcareer/releases/<timestamp>/` and only then
does `current` point at it, so the switch is instant and the previous five
releases stay on disk. To go back:

```bash
ssh -i ~/.ssh/sfc_vps root@187.127.181.146
ls -1dt /var/www/skillforcareer/releases/*/          # newest first
ln -sfn /var/www/skillforcareer/releases/<older> /var/www/skillforcareer/current.new
mv -Tf /var/www/skillforcareer/current.new /var/www/skillforcareer/current
systemctl restart skillforcareer
```

## Looking in

```bash
systemctl status skillforcareer
journalctl -u skillforcareer -f            # the site's log
curl -s localhost:3000/api/health          # database included
nginx -t && systemctl reload nginx
```

## What is deliberately absent

* No git, no clone, no `.git` — nothing on the server can be turned back into
  the project.
* No source: `src/` is stripped to `src/generated/prisma`, the database client
  the running server loads.
* No `.env` in the app directory; secrets live in `/etc/skillforcareer/app.env`.
* No build tools: nothing is compiled on the server, so a deploy cannot fail
  halfway and leave the site down.
* `scripts/deploy-vps.sh` refuses to ship if any of that reappears in the
  staged build.

## Notes

* The database stays on TiDB Cloud. The VPS is web hosting, not storage — a
  wiped server costs a redeploy, not data.
* Scheduled jobs (birthday greetings, class reminders) are hosted crons hitting
  the site's own endpoints. If this server becomes the only home for the site,
  add them to `crontab` as `curl` calls carrying the cron secret.
* `client_max_body_size` in `nginx.conf` is 64 MB — raise it if the academy
  starts uploading longer recordings through the panel.
