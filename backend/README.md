# SocietyPro Backend — Home Server Setup

> **Responsibility:** Only email (SendGrid) + SMS (MSG91) + cron endpoints.
> All database operations happen directly in the browser via Supabase SDK.
> If this server is offline, the app works fully — only notifications pause.

## Quick Start

```bash
cd backend
cp .env.example .env       # fill in your values
npm install
npm start                  # production
npm run dev                # development (nodemon)
```

## Run with PM2 (recommended for home server)

```bash
# Install PM2 globally
npm install -g pm2

# Start backend
pm2 start ecosystem.config.js --env production

# Save PM2 config (persist after reboot)
pm2 save

# Auto-start on system boot
pm2 startup
# ↑ Run the command it prints

# Useful commands
pm2 logs societypro-backend   # live logs
pm2 restart societypro-backend
pm2 status
```

## HTTPS for GitHub Pages compatibility

GitHub Pages (HTTPS) cannot call HTTP endpoints (mixed-content blocked).
Your home server **must be HTTPS**. Three options:

### Option A: Cloudflare Tunnel (easiest — no port forwarding)
```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared

# One-time login (creates a tunnel)
./cloudflared login

# Create named tunnel
./cloudflared tunnel create societypro

# Start (gives you https://xxxx.cfargotunnel.com)
./cloudflared tunnel --url http://localhost:3001 run societypro
```
Then set `API_BASE = 'https://xxxx.cfargotunnel.com'` in `frontend/lib/supabase.js`.

### Option B: Nginx + Let's Encrypt (if you have a domain)
```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d home.yourdomain.com
# Copy nginx.conf → /etc/nginx/sites-available/societypro
sudo ln -s /etc/nginx/sites-available/societypro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Option C: ngrok (testing only — URL changes each restart)
```bash
ngrok http 3001
# Use the https://xxxx.ngrok.io URL temporarily
```

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check (used by frontend fallback) |
| `/api/notify/email` | POST | Send email via SendGrid |
| `/api/notify/sms` | POST | Send SMS via MSG91 |
| `/api/jobs/run-penalties` | POST | Apply late payment penalties |
| `/api/jobs/send-overdue-reminders` | POST | Email+SMS overdue invoices |
| `/api/jobs/send-amc-alerts` | POST | AMC expiry alerts |

## Environment Variables

See `.env.example` for all required variables.
