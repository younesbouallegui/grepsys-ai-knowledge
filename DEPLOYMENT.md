# Production Deployment Guide

This project ships with a complete CI/CD pipeline (GitHub Actions → SSH → Docker → Nginx)
designed for deploying to any standard VPS (Ubuntu/Debian recommended).

## 1. Architecture

```
GitHub (push to main)
   │
   ▼
GitHub Actions
   ├─ Install · Lint · Test · Build
   └─ rsync to VPS  →  docker compose up -d
                          │
                          ▼
                    Container :80  ─►  Host Nginx (reverse proxy + SSL)  ─►  Internet
```

## 2. Server prerequisites

```bash
# On the VPS (one-time)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx rsync
sudo usermod -aG docker $USER
```

Create a deploy directory, e.g. `/opt/poulina-ai`:

```bash
sudo mkdir -p /opt/poulina-ai && sudo chown $USER:$USER /opt/poulina-ai
```

## 3. GitHub repository secrets

Add the following under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `SSH_HOST` | VPS hostname or IP |
| `SSH_USER` | SSH user (must be in `docker` group) |
| `SSH_PRIVATE_KEY` | Private key whose public counterpart is in `~/.ssh/authorized_keys` on the VPS |
| `DEPLOY_PATH` | Absolute path on server, e.g. `/opt/poulina-ai` |
| `VITE_SUPABASE_URL` | Backend URL (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Backend anon key (public) |
| `VITE_SUPABASE_PROJECT_ID` | Backend project ref |

## 4. Reverse proxy + SSL

Copy `deploy/nginx.reverse-proxy.example.conf` to the server, adjust the domain name, then:

```bash
sudo cp deploy/nginx.reverse-proxy.example.conf /etc/nginx/sites-available/poulina-ai.conf
sudo ln -s /etc/nginx/sites-available/poulina-ai.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 5. Local Docker run

```bash
cp .env.example .env   # then edit values
docker compose up -d --build
# Visit http://localhost:8080
```

## 6. Manual deploy (without GitHub Actions)

```bash
rsync -az --delete --exclude=node_modules --exclude=dist ./ user@server:/opt/poulina-ai/
ssh user@server "cd /opt/poulina-ai && docker compose up -d --build"
```

## 7. Rollback

```bash
ssh user@server "cd /opt/poulina-ai && git checkout <previous-sha> && docker compose up -d --build"
```

## 8. Logs & monitoring

```bash
docker compose logs -f --tail=200 web
docker compose ps
```

Container logs are JSON-rotated (10 MB × 5 files). Healthcheck pings `GET /` every 30 s.

## 9. Notes

- Frontend env vars (`VITE_*`) are **inlined at build time** — they are baked into the static
  bundle. Rebuild the image to change them.
- Backend (Edge Functions, database) continues to be managed by Lovable Cloud and is
  independent of this VPS deployment.
- The container is stateless; safe to scale horizontally behind a load balancer.
