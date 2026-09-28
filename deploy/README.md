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

## This machine is shared

The academy's VPS already serves another site (`jls.limo`, `jls.service`, port
3000). Nothing here touches it: this site runs as its own service on its own
port, behind its own nginx file, and provisioning installs only what is missing
and leaves the firewall alone. Its port is `PORT` in
`/etc/skillforcareer/app.env` — currently **3200**.

## First time

1. **Give the laptop a key.** The server accepts public keys only — the hPanel
   root password is not an SSH password. Add the deploy key's public half in
   hPanel → VPS → SSH keys (or append it to `/root/.ssh/authorized_keys` from
   the browser console), then check:

   ```bash
   ssh -i ~/.ssh/sfc_vps root@187.127.181.146 'echo ok'
   ```

2. **Provision the box.** Copy the files across and run the script. Before any
   DNS is moved, provision a preview — the site on a port of its own, no
   certificate needed:

   ```bash
   scp -i ~/.ssh/sfc_vps deploy/* root@187.127.181.146:/root/deploy-sfc/
   ssh -i ~/.ssh/sfc_vps root@187.127.181.146 \
     'SKIP_TLS=1 PREVIEW_PORT=8080 APP_PORT=3200 bash /root/deploy-sfc/provision.sh preview'
   ```

   With a domain pointed at `187.127.181.146`, run it for real instead — this
   takes the certificate and serves 80/443 for that name only:

   ```bash
   ssh -i ~/.ssh/sfc_vps root@187.127.181.146 \
     'APP_PORT=3200 bash /root/deploy-sfc/provision.sh lms.skillforcareer.com'
   ```

   Hostinger's own firewall only lets 22, 80 and 443 through, so the preview
   port is reachable from the server itself (and over an SSH tunnel), not from
   the open internet:

   ```bash
   ssh -i ~/.ssh/sfc_vps -L 8080:127.0.0.1:8080 root@187.127.181.146
   # then open http://localhost:8080
   ```

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
