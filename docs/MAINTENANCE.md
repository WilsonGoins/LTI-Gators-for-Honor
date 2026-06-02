# Maintenance Guide

This document covers how the Canvas SEB Quiz Creator is deployed and hosted in its current state, the routine maintenance workflow, and the pressing issues that the next team needs to be aware of. Read this alongside SETUP_GUIDE.md (local development) and UF_MIGRATION_GUIDE.md (moving to UF's Canvas).

If you are picking this project up after the original team has graduated, read the "Pressing Maintenance Issues" section first. Several accounts and credits are tied to the original team's GitHub Student Developer Pack and will expire.

---

## Accounts and Dashboards

Everything below is owned by the original team (Wilson Goins). A new maintainer will need access transferred or will need to recreate these under their own accounts. Most are tied to the GitHub Student Developer Pack.

| Service | Purpose | Dashboard |
|---------|---------|-----------|
| GitHub | Source code repository | https://github.com/WilsonGoins/LTI-Gators-for-Honor |
| DigitalOcean | Droplet hosting the LTI tool (frontend + backend) | https://cloud.digitalocean.com/droplets/563980918/networking?i=087000 |
| name.com | Domain registration (`gatorsforhonor.app`) | https://www.name.com/account/domain/details/gatorsforhonor.app |
| Cloudflare | DNS + Tunnel exposing local Canvas | https://dash.cloudflare.com/144829a167a365c797f1748b0224d588/gatorsforhonor.app |
| Neon | PostgreSQL database | https://neon.tech (project owned by the team) |

---

## Architecture Overview

The production deployment has three moving parts that all need to be running for an LTI launch to work end to end.

1. **The LTI tool (frontend + backend)** runs on a DigitalOcean droplet at a fixed public IP. This is always on. It is reachable at `https://gatorsforhonor.app`.

2. **Canvas** runs locally in Docker on a team member's laptop. It is not hosted in the cloud because Canvas needs 8 to 10 GB of RAM, which would require a far more expensive droplet. A Cloudflare Tunnel exposes the local Canvas at `https://canvas-dev.gatorsforhonor.app` so the droplet and external browsers can reach it. This is the part most likely to be offline, because it only works while the laptop is running Canvas and the tunnel.

3. **The database** is PostgreSQL hosted on Neon. It is always on and is reached by the backend over the internet from the droplet.

```
                          Internet
                              |
        +---------------------+----------------------+
        |                                            |
  gatorsforhonor.app                      canvas-dev.gatorsforhonor.app
  (DigitalOcean droplet,                  (Cloudflare Tunnel to a
   fixed public IP)                        laptop running Canvas)
        |                                            |
   Nginx (reverse proxy + SSL)              cloudflared on laptop
        |                                            |
   +----+-----+                              Canvas in Docker (:3000)
   |          |
 frontend   backend  ---- Canvas API calls ----> canvas-dev.gatorsforhonor.app
 (:3002)    (:3001)
                |
                +---- SQL over the internet ----> Neon (PostgreSQL)
```

The key reason for this split: the droplet is cheap and always on, which is what the tool needs. Canvas is expensive to host, so it stays local for now. The long-term fix is to migrate Canvas to UF's hosted instance (see UF_MIGRATION_GUIDE.md), which removes the Cloudflare Tunnel entirely.

---

## The Droplet

The droplet runs the frontend and backend together on a single $6/month instance (1 GB RAM, 25 GB SSD). A Node backend and Next.js frontend together use only a few hundred MB, so this tier is comfortable.

- **Public IP:** `45.55.173.70`
- **SSH:** `ssh root@45.55.173.70`
- **Project location:** `~/LTI-Gators-for-Honor`
- **Process manager:** PM2 keeps both processes running and restarts them on reboot.

### Adding another maintainer's SSH access

The new maintainer generates a key on their machine if they don't have one:

```bash
ssh-keygen -t ed25519
cat ~/.ssh/id_ed25519.pub
```

They send you the public key, then on the droplet add it on a new line:

```bash
nano ~/.ssh/authorized_keys
```

You can also add keys during droplet creation in the DigitalOcean dashboard under Authentication.

### PM2 process management

Both processes are managed by PM2 and named `backend` and `frontend`.

```bash
pm2 status            # see both processes, should both be "online"
pm2 logs              # tail logs from both
pm2 logs backend      # tail just the backend
pm2 restart backend   # restart after a code or .env change
pm2 restart frontend
```

PM2 is configured to survive reboots via `pm2 startup` and `pm2 save`. If you ever change which processes run, run `pm2 save` again so the new set persists across reboots.

---

## Nginx and SSL

Nginx sits in front of both apps as a reverse proxy and terminates SSL. The config lives at `/etc/nginx/sites-available/gatorsforhonor` and is symlinked into `/etc/nginx/sites-enabled/`.

Routing rules: every backend route prefix proxies to port 3001, and everything else falls through to the frontend on port 3002. The backend route prefixes are:

- `/lti/`
- `/keys`
- `/api/`
- `/seb/`
- `/health`
- `/jwks.json`

If you add a new top-level backend route, you must add a matching `location` block to the Nginx config or it will be served by the frontend by mistake. After editing:

```bash
nginx -t                  # test the config
systemctl restart nginx
```

SSL certificates come from Let's Encrypt via Certbot and were installed with:

```bash
certbot --nginx -d gatorsforhonor.app -d www.gatorsforhonor.app
```

Certbot installs a renewal timer automatically, so the certificate should renew on its own. To confirm renewal is healthy:

```bash
certbot renew --dry-run
```

---

## The Domain (name.com and Cloudflare)

The domain `gatorsforhonor.app` was registered free through the GitHub Student Developer Pack name.com offer. The `.app` TLD enforces HTTPS automatically, which suits LTI since Canvas requires HTTPS for non-localhost tools.

DNS is managed by Cloudflare, not name.com. The nameservers at name.com were pointed to Cloudflare. DNS records in Cloudflare:

- **A record** `@` to `45.55.173.70` (the droplet), DNS only (gray cloud).
- **A record** `www` to `45.55.173.70`, DNS only.
- **CNAME record** `canvas-dev` to the Cloudflare Tunnel (created automatically by `cloudflared tunnel route dns`).

If you ever move the droplet, update the two A records to the new IP.

---

## The Cloudflare Tunnel for Local Canvas

The tunnel exposes the laptop's local Canvas to the internet so the droplet and external browsers can reach it during a launch. **This must be re-created on whatever machine runs Canvas if the project continues on a different laptop.** It is the single most fragile piece of the setup.

The tunnel is named `canvas-dev` and routes `canvas-dev.gatorsforhonor.app` to `http://localhost:3000` on the laptop.

### Re-creating the tunnel on a new machine

1. Install cloudflared:

   ```powershell
   winget install cloudflare.cloudflared
   ```

   On Windows you may need to add cloudflared to your PATH and restart the machine before the `cloudflared` command is recognized.

2. Authenticate (opens a browser, select `gatorsforhonor.app` and authorize):

   ```bash
   cloudflared tunnel login
   ```

3. Create the tunnel (outputs a tunnel ID, note it):

   ```bash
   cloudflared tunnel create canvas-dev
   ```

4. Route DNS to the tunnel:

   ```bash
   cloudflared tunnel route dns canvas-dev canvas-dev.gatorsforhonor.app
   ```

5. Create the config file at `~/.cloudflared/config.yml` (on Windows, `C:\Users\<YourName>\.cloudflared\config.yml`):

   ```yaml
   tunnel: <your-tunnel-id>
   credentials-file: C:\Users\<YourName>\.cloudflared\<your-tunnel-id>.json

   ingress:
     - hostname: canvas-dev.gatorsforhonor.app
       service: http://localhost:3000
     - service: http_status:404
   ```

6. Start Canvas (`docker compose up -d`), then start the tunnel:

   ```bash
   cloudflared tunnel run canvas-dev
   ```

   If you get a 503 or "cannot find the file specified," pass the config path explicitly:

   ```bash
   cloudflared tunnel --config "C:\Users\<YourName>\.cloudflared\config.yml" run canvas-dev
   ```

### Canvas must allow the tunnel hostname

Canvas rejects requests for a hostname it doesn't recognize. In the Canvas project, set `config/domain.yml`:

```yaml
development:
  domain: "canvas-dev.gatorsforhonor.app"
```

Then restart Canvas: `docker compose restart web`. The `domain.yml` change is the important one. (An `allowed hosts` initializer is sometimes suggested by the error page, but in practice the `domain.yml` change alone has been sufficient.)

The tunnel only works while both Canvas and `cloudflared` are running on the laptop. When the laptop sleeps or the tunnel stops, `canvas-dev.gatorsforhonor.app` goes down and LTI launches fail until it is restarted.

---

## Routine Deploy Workflow

Code is developed locally in VS Code, pushed to GitHub, and pulled onto the droplet. The droplet does not build from a CI pipeline. The flow is:

1. Commit and push from your local machine to `main`.
2. SSH into the droplet: `ssh root@45.55.173.70`
3. Pull and restart:

   ```bash
   cd ~/LTI-Gators-for-Honor
   git pull
   pm2 restart backend
   pm2 restart frontend
   ```

If `git pull` reports divergent branches and you know your local push is the source of truth, reset the droplet to match the remote:

```bash
git reset --hard origin/main
git pull
```

GitHub no longer accepts password authentication over HTTPS. The droplet needs a Personal Access Token with `repo` scope to pull from a private repository. Generate one in GitHub under Settings, Developer settings, Personal access tokens, and use it in place of a password when prompted.

After a `.env` change on the droplet, restart the backend so it picks up the new values. The frontend reads `NEXT_PUBLIC_BACKEND_URL` at build/run time, so restart it too if you change frontend env vars.

---

## Environment Variables in Production

The production `.env` on the droplet differs from the local development template in a few values. The structure matches `.env.example`, but the URLs point at the deployed domain and the tunnel instead of localhost.

The values that change for production:

```
CANVAS_URL=https://canvas-dev.gatorsforhonor.app
CANVAS_API_URL=https://canvas-dev.gatorsforhonor.app/api/v1
TOOL_URL=https://gatorsforhonor.app
GATE_BASE_URL=https://gatorsforhonor.app/seb
```

The frontend `.env` sets the backend URL to the same domain, since Nginx routes `/api/`, `/seb/`, `/keys`, and the other backend prefixes to the backend automatically:

```
NEXT_PUBLIC_BACKEND_URL=https://gatorsforhonor.app
```

`CANVAS_ACCESS_TOKEN`, the OAuth client ID and secret, and the database connection strings carry the same meaning as in development. See SETUP_GUIDE.md for what each one is and where it comes from.

The droplet should also set `NODE_ENV=production`. The OAuth cookies in `src/routes/launch.js` only get the `Secure` flag when `NODE_ENV === 'production'`, and a real HTTPS deployment needs that flag (browsers reject `Secure`-less cookies on `SameSite=None`, and over HTTPS the cookies should be `Secure` regardless). `NODE_ENV` is not in `.env.example`, so it is easy to miss; confirm it is set on the droplet.

---

## Current State of the Project

As of the final submission:

- The tool is deployed and running on the droplet at `https://gatorsforhonor.app`.
- Canvas runs locally and is exposed via the Cloudflare Tunnel at `https://canvas-dev.gatorsforhonor.app`.
- The full instructor workflow works: list courses and quizzes, configure SEB settings, generate the `.seb` file, set and remove the access code, and set the quiz access (unlock) date. The generated `.seb` file is stored in the database (as bytes in `seb_config_files.file_data`) and delivered to each student on demand: the student launch flow regenerates and streams a per-student `.seb` rather than distributing a shared file. (The schema retains a `file_link` column and the quiz-sync logic cleans up Canvas file links, so an instructor-side "upload to Canvas Files" path may also exist in `routes/seb.js`; that file was not reviewed here, so this document does not assert it as a current behavior either way.)
- The student launch flow works end to end on local Canvas: a student opens the quiz, clicks the launch link, authorizes the app through a Canvas OAuth consent screen, receives a per-student `.seb` file, and is redirected into the quiz with the access code applied after SEB validates.
- The usability study (n=166, within-subjects, SEB vs. Respondus LockDown Browser) is complete and written up.

What has not happened yet:

- Migration to UF's hosted Canvas. Everything still points at the local Canvas through the tunnel. See UF_MIGRATION_GUIDE.md.

---

## Pressing Maintenance Issues

Read these before assuming the tool will keep running on its own.

### DigitalOcean credits will run out

The droplet is paid for with the $200 DigitalOcean credit from the GitHub Student Developer Pack. That credit is valid for one year from signup. At $6/month the credit easily covers a full year, but **when the credit expires the droplet will stop unless someone adds a payment method or migrates hosting.** When the original owner's Student Developer Pack lapses (for example, after graduation), this is the first thing that will break. Plan to either transfer the droplet to a maintainer with active credits, add a paid card, or migrate the tool to UF-provided hosting.

### The domain depends on the Student Developer Pack

`gatorsforhonor.app` was registered free through name.com via the Student Developer Pack. Confirm the renewal terms on name.com. If the free registration does not renew, the domain could lapse, which breaks both `gatorsforhonor.app` and the `canvas-dev` subdomain used by the tunnel.

### Canvas is not hosted and depends on a laptop

Because Canvas runs locally and is exposed through the Cloudflare Tunnel, the whole system only works while that laptop is on and running both Canvas and the tunnel. This is fine for demos and development but is not a real production setup. Migrating to UF's hosted Canvas removes this dependency and the tunnel entirely. This is the single biggest reliability improvement available and should be the next team's priority if the tool is meant to be used for real exams.

### The Neon database is on the free tier

The database is on Neon's free tier. Confirm it has not been paused for inactivity and that the free tier limits are not being exceeded if usage grows.

---

## Known Smaller Issues

- The `/health` endpoint is public and returns a small JSON status object (service name, timestamp, version). It is useful for an uptime check against `https://gatorsforhonor.app/health`.
- There is no `devMode` flag in `src/app.js` (that was an ltijs convention this hand-rolled tool does not use). The backend logs through plain `console.log` statements, visible via `pm2 logs backend`. If you need quieter or more verbose output, adjust the logging in the source.
- A roughly 2 hour Canvas timezone offset was traced to the internal Docker Canvas configuration, not the tool's code. It is deliberately not fixed in the application code. Migrating off the local Docker Canvas is expected to resolve it.
- The tool's LTI signing keys are generated in memory at backend startup (`src/app.js`, `initializeKeys`) and are not persisted. Every backend restart (including every `pm2 restart backend`) produces a fresh keypair. This works because Canvas fetches the tool's public key from `/keys` at launch time and picks up the current key, but it does mean there is no stable keypair on disk. The practical requirement is that Canvas must be able to reach the tool's `/keys` URL during a launch. If a launch fails right after a restart, this is not the likely cause (Canvas re-fetches), but it is worth knowing the keys are ephemeral. A future hardening step would be to persist the keypair (env var or file) so it survives restarts.
- `SESSION_SECRET` and `FRONTEND_URL` are read from the environment in `src/app.js` but are not in `.env.example`. Locally they fall back to safe defaults (`FRONTEND_URL` defaults to `http://localhost:3002`, `SESSION_SECRET` to a random value generated each boot). In production, set both: `FRONTEND_URL` so redirects and CORS target the right origin, and `SESSION_SECRET` so instructor sessions survive a backend restart (otherwise the random per-boot secret invalidates existing session tokens on every restart).

## Maintenance Questions
- For questions about Neon DBMS reach out to Shane Downs (sdowns1017@gmail.com).
- For questions about GitHub, DigitalOcean, Name.com, Cloudflare, or anything else reach out to Wilson Goins (wilsonfgoins@gmail.com).