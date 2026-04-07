# VPS Deployment Scripts

`deploy_vps.sh` updates the current live VPS setup without replacing the working production folder structure.

It is designed for the current server topology:

- Git-tracked source clone: `/opt/fresh-eggs-market-src`
- Live backend Docker project: `/opt/fresh-eggs-ops`
- Live frontend docroot: `/home/digivlrx/fresheggsmarket.hiddekellabs.com`

What it preserves:

- `/opt/fresh-eggs-ops/.env`
- `/opt/fresh-eggs-ops/docker-compose.yml`
- Docker project name and ports
- Existing Postgres data volume
- Frontend `.htaccess`
- Frontend `.well-known`

Typical usage on the VPS:

```bash
cd /opt/fresh-eggs-market-src
sudo bash scripts/deploy_vps.sh
```

API-only deploy:

```bash
cd /opt/fresh-eggs-market-src
sudo bash scripts/deploy_vps.sh api
```

Web-only deploy:

```bash
cd /opt/fresh-eggs-market-src
sudo bash scripts/deploy_vps.sh web
```
