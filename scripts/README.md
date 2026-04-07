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

## Staging

`deploy_vps_staging.sh` deploys the Git-tracked clone into a separate staging environment.

Expected staging layout:

- source clone: `/opt/fresh-eggs-market-src`
- staging web root: `/home/digivlrx/staging.fresheggsmarket.hiddekellabs.com`
- staging env file: `/opt/fresh-eggs-market-src/.env.staging`
- staging compose file: `/opt/fresh-eggs-market-src/docker-compose.staging.yml`

Typical usage:

```bash
cd /opt/fresh-eggs-market-src
sudo SEED=1 bash scripts/deploy_vps_staging.sh
```

Later deploys:

```bash
cd /opt/fresh-eggs-market-src
sudo bash scripts/deploy_vps_staging.sh
```
