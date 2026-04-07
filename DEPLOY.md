# Fresh Eggs Operations — Deployment Guide

## Prerequisites on VPS
- Ubuntu 22+ (or Debian 11+)
- Root or sudo access
- Domain `fresheggsmarket.hiddekellabs.com` pointed to VPS IP

## Step 1: Install Docker + Docker Compose

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

## Step 2: Install Certbot (SSL)

```bash
apt install certbot -y

# Get SSL cert (make sure domain points to this server first)
certbot certonly --standalone -d fresheggsmarket.hiddekellabs.com
```

## Step 3: Upload project to VPS

```bash
# From your local machine (or clone from git)
scp -r fresh-eggs-ops/ root@YOUR_VPS_IP:/opt/fresh-eggs-ops/
```

## Step 4: Configure environment

```bash
cd /opt/fresh-eggs-ops

# Copy and edit environment file
cp .env.example .env
nano .env
# Set real values for DB_PASSWORD and JWT_SECRET
```

Generate a strong JWT secret:
```bash
openssl rand -base64 48
```

## Step 5: Build and start

```bash
cd /opt/fresh-eggs-ops

# Build all containers
docker compose build

# Start everything
docker compose up -d

# Run database migrations
docker compose exec api npx prisma migrate deploy

# Seed initial data (admin user, bank accounts)
docker compose exec api node prisma/seed.js

# Check everything is running
docker compose ps
```

## Step 6: Verify

- Visit https://fresheggsmarket.hiddekellabs.com
- Login with: chioma@fresheggs.com / admin12345
- **Change the admin password immediately after first login**

## Useful commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f db

# Restart a service
docker compose restart api

# Rebuild after code changes
docker compose build api && docker compose up -d api

# Database backup
docker compose exec db pg_dump -U fresheggs fresh_eggs > backup_$(date +%Y%m%d).sql

# Database restore
cat backup.sql | docker compose exec -T db psql -U fresheggs fresh_eggs

# Open Prisma Studio (DB browser)
docker compose exec api npx prisma studio
```

## Auto-restart on server reboot

Docker's `restart: unless-stopped` policy handles this automatically.

## SSL certificate renewal

```bash
# Test renewal
certbot renew --dry-run

# Auto-renewal is set up by default, but add a cron to restart nginx after renewal:
echo '0 3 * * * certbot renew --quiet && docker compose -f /opt/fresh-eggs-ops/docker-compose.yml restart nginx' | crontab -
```
