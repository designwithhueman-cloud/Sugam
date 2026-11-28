# Deploying Avara on one server

This puts Avara on a single rented server (a VPS) with three parts: the app with its scanner, a Postgres database, and Caddy for HTTPS. It costs about $6–12 a month. Everything you need is in `deploy/`.

What you need first:
- **A server.** Hetzner Cloud with 4 GB RAM is enough (8 GB gives room to grow). Ubuntu 24.04, in a region near your users.
- **A domain.** For example from Cloudflare Registrar.
- **A paid AI key.** Either Gemini with billing turned on, or Claude. On Gemini's free tier, Google may use what Avara sends to improve its products.
- **An email address for the privacy page.** Cloudflare Email Routing can forward `hello@yourdomain` to your Gmail for free.

## 1. Point the domain at the server

In Cloudflare DNS, add two records:
- **A** record, name `@`, value set to your server's IPv4 address.
- **A** record, name `www`, same value.

Set both to **DNS only** (grey cloud) for the first setup, so Caddy can get its HTTPS certificate. You can turn the proxy (orange cloud) on later, with SSL mode set to "Full (strict)".

## 2. Prepare the server

Connect with SSH as root, then install Docker and open only SSH and the web ports:

```bash
apt update && apt upgrade -y && apt install -y git ufw
```

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 3. Get the code and fill in the settings

```bash
git clone <your repository URL> /opt/avara && cd /opt/avara
```

```bash
cp deploy/production.env.example deploy/production.env && chmod 600 deploy/production.env
```

Generate the two secrets and paste them into `deploy/production.env` as `POSTGRES_PASSWORD` and `SUGAM_SECRET`:

```bash
openssl rand -hex 32
```

Then edit the file (`nano deploy/production.env`):
- Set `AVARA_DOMAIN` and `SUGAM_URL` to your domain.
- Set `AVARA_CONTACT_EMAIL` to your contact address, and `AVARA_OPERATOR` to your name or company. Both appear on the privacy page.
- Add your AI key.

The file is ignored by git, so never copy it into the repository.

## 4. Start it

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/production.env up -d --build
```

The first build takes 5–10 minutes. The database tables are created automatically on the first start. Watch the logs:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/production.env logs -f app
```

## 5. Check that it works

This checks the main pages and runs one real scan from start to finish:

```bash
sh deploy/smoke.sh https://yourdomain.com
```

Then open the site, sign up, run a scan, and check the report, the fix, and "Delete this scan".

## 6. Back up every night

```bash
(crontab -l 2>/dev/null; echo "15 3 * * * cd /opt/avara && sh deploy/backup.sh >> /var/log/avara-backup.log 2>&1") | crontab -
```

This keeps 14 days of database dumps and screenshots in `/opt/avara-backups`. Also copy that folder off the server: Hetzner Storage Box, or Cloudflare R2 with `rclone`.

## Updating

```bash
cd /opt/avara && git pull && docker compose -f deploy/docker-compose.yml --env-file deploy/production.env up -d --build
```

Scans that were running during the restart are queued again automatically. Scans older than 6 hours are marked "did not finish".

## Giving a workspace a paid plan

There is no payment system yet. Paid plans are set by hand for people from the waiting list:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/production.env exec db psql -U avara -d avara -c "update organizations set plan='agency' where slug='their-workspace'"
```

The plan values are `free`, `site` or `agency`.

## What runs where, and the limits

- **Scans run inside the app container.** `SCAN_CONCURRENCY` sets how many run at once (default 2). Each one uses about 1 GB of RAM. Raise it only on a larger server.
- **Rate limits** are kept in memory: 5 scans per 10 minutes for anonymous visitors, 20 when signed in, and at most 60 anonymous scans in total per 10 minutes. They reset when the app restarts.
- **Anonymous scans** are deleted after `ANON_RETENTION_DAYS` (default 30). Signed-in users and workspace owners can delete scans themselves, and anyone can delete their own account from Settings.
- **Running more than one app server** needs Redis (`REDIS_URL`) and `npm run worker`. Set `AVARA_BACKGROUND=off` on all but one web server. One server is plenty at launch.

## If something is wrong

| Symptom | Check |
|---|---|
| The site has no HTTPS certificate | DNS must point at this server with the Cloudflare proxy off; check `docker compose … logs caddy` |
| Scans fail at once | `docker compose … logs app`. Chrome errors usually mean too little memory: use a larger server or lower `SCAN_CONCURRENCY` |
| The AI review never finishes | Check the key and its billing. Reports still complete without it, and the AI checks are listed as "didn't run" |
| Sign-in loops | `SUGAM_URL` must be exactly `https://yourdomain` |
