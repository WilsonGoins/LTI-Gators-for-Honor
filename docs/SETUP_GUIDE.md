# New Developer Setup Guide

**Canvas SEB Quiz Creator in Local Development Environment**

This guide walks you through setting up the complete development environment from scratch. By the end, you'll have Canvas LMS running locally in Docker and the LTI tool connected to it.

**Time estimate:** 1–2 hours (most of it is Canvas asset compilation)

---

## Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | Runs Canvas LMS and MongoDB |
| [Node.js](https://nodejs.org/) | 18+ (recommend 20) | Runs the LTI tool |
| [Git](https://git-scm.com/) | Latest | Version control |
| RAM | 12 GB minimum | Docker needs ~8–10 GB for Canvas |

### Docker Desktop Memory Configuration

Canvas LMS is very resource-intensive. You **must** allocate sufficient memory or Canvas will fail to start with Passenger timeout errors.

**Windows (WSL 2 backend):**

Docker Desktop on Windows uses WSL 2, so memory is configured via a `.wslconfig` file. Create or edit `C:\Users\<YourUsername>\.wslconfig`:

```ini
[wsl2]
memory=10GB
swap=4GB
processors=4
```

After saving, restart WSL:

```powershell
wsl --shutdown
```

Then restart Docker Desktop.

**Mac/Linux:**

Go to Docker Desktop → Settings → Resources → Advanced. Set Memory to at least **8 GB** (10 GB recommended).

---

## Part 1: Set Up Canvas LMS Locally

### 1.1 Clone Canvas

```bash
cd C:\tmp                    # or ~/projects on Mac/Linux
git clone https://github.com/instructure/canvas-lms.git canvas
cd canvas
```

### 1.2 Copy Config Files

Canvas requires several configuration files that must be copied from templates. **All five files are required:**

```bash
# Windows PowerShell:
copy docker-compose\config\database.yml config\database.yml
copy docker-compose\config\redis.yml config\redis.yml
copy docker-compose\config\domain.yml config\domain.yml
copy docker-compose\config\security.yml config\security.yml
copy docker-compose\config\dynamic_settings.yml config\dynamic_settings.yml

# Mac/Linux:
for file in database.yml redis.yml domain.yml security.yml dynamic_settings.yml; do
  cp docker-compose/config/$file config/$file
done
```

> **CRITICAL:** Do not skip `redis.yml` — Canvas will hang on startup without it. Do not skip `dynamic_settings.yml` — LTI 1.3 will not work without the signing keys it contains.

### 1.3 Configure database.yml

Open `config/database.yml` in a text editor. Ensure the development section looks like:

```yaml
development:
  adapter: postgresql
  encoding: utf8
  database: canvas_development
  host: postgres
  username: postgres
  password: sekret
  timeout: 5000
```

Also update the `test` and `production` sections similarly. Remove or comment out any `secondary:` replica config blocks and `shard` references — they aren't needed for local dev and will cause errors.

### 1.4 Configure domain.yml

Open `config/domain.yml` and ensure it contains:

```yaml
development:
  domain: "localhost:3000"
```

### 1.5 Enable Docker Compose Override

```bash
# Windows:
copy docker-compose.override.yml.example docker-compose.override.yml

# Mac/Linux:
cp docker-compose.override.yml.example docker-compose.override.yml
```

Edit `docker-compose.override.yml` and ensure the `web` service has port mapping:

```yaml
web:
  ports:
    - "3000:80"
```

### 1.6 Create an Empty .env File

The webpack service references `.env` — it just needs to exist:

```bash
# Windows PowerShell:
New-Item -Path .env -ItemType File

# Mac/Linux:
touch .env
```

### 1.7 Create the Passenger Timeout Fix

Canvas is a large Rails application that can take over 90 seconds to boot on first startup. The default Passenger timeout of 90 seconds is often too short, especially on Windows/WSL 2. Create an entrypoint script to increase it.

Create a file called `entrypoint-override.sh` in the Canvas project root:

```bash
#!/bin/bash
sed -i 's/passenger_start_timeout 90/passenger_start_timeout 300/' /usr/src/nginx/nginx.conf
exec "$@"
```

Then add this to the `web` service in your `docker-compose.override.yml`:

```yaml
web:
  <<: *BASE
  entrypoint: ["/bin/bash", "/usr/src/app/entrypoint-override.sh"]
  ports:
    - "3000:80"
```

> **Why is this needed?** Passenger (the app server) kills the Rails boot process if it takes longer than 90 seconds. On Docker Desktop with WSL 2, the first boot frequently exceeds this. Increasing the timeout to 300 seconds prevents false startup failures.

### 1.8 Install Bundler Plugin

```bash
docker compose run --rm web bash -c "gem install bundler-multilock && bundle install"
```

This takes several minutes. Wait for it to complete.

### 1.9 Create the Database

```bash
docker compose run --rm web bundle exec rake db:create db:initial_setup
```

You'll be prompted to create an admin account. **Write down the email and password** — you'll need them to log into Canvas.

### 1.10 Install JavaScript Dependencies

```bash
docker compose run --rm web yarn install
```

If you get corruption errors, clear the cache and retry:

```bash
docker compose down
docker volume rm canvas_node_modules   # may fail if volume name differs; that's OK
docker compose run --rm web bash -c "yarn cache clean && yarn install --force"
```

### 1.11 Compile Assets

```bash
docker compose run --rm web bundle exec rake canvas:compile_assets_dev
```

**This takes 15–30 minutes.** Let it run — don't Ctrl+C. When finished, you'll get your command prompt back.

### 1.12 Verify dynamic_settings.yml Has LTI Signing Keys (CRITICAL)

Canvas needs JWK signing keys for LTI 1.3. The stock `dynamic_settings.yml` from `docker-compose/config/` should already include them under the `store` section.

Verify this critical section exists:

```bash
# Windows PowerShell:
Select-String -Path config\dynamic_settings.yml -Pattern "store:"

# Mac/Linux:
grep "store:" config/dynamic_settings.yml
```

You should see a line containing `store:`. If not, you copied the wrong file. Re-copy from the stock template:

```bash
# Windows:
copy docker-compose\config\dynamic_settings.yml config\dynamic_settings.yml

# Mac/Linux:
cp docker-compose/config/dynamic_settings.yml config/dynamic_settings.yml
```

> **Why this matters:** Canvas stores its LTI signing keys under the `store > canvas > lti-keys` path in `dynamic_settings.yml`. If only the `config` section exists (without `store`), Canvas will crash with `NoMethodError: undefined method 'sign' for nil` when trying to sign LTI JWT tokens. This manifests as a 500 error during LTI launches with no useful error in the browser.

### 1.13 Start Canvas

```bash
docker compose up -d
```

**Wait 3–4 minutes** for Canvas to fully boot. Canvas is a large Rails application and the first request triggers a slow initialization process.

You can monitor startup progress with:

```bash
docker compose logs -f web
```

Look for `Passenger core online` followed by successful HTTP responses. If you see `A timeout occurred while starting a preloader process`, the Passenger timeout fix from step 1.7 is not applied — revisit that step.

Open `http://localhost:3000` in your browser. Log in with the admin credentials you created in step 1.9.

### 1.14 Verify LTI Signing Keys

```bash
curl http://localhost:3000/api/lti/security/jwks
```

You should see JSON with a `keys` array. If you get a 500 error, redo step 1.12.

**Canvas is now running. You only need to do steps 1.1–1.14 once. After this, `docker compose up -d` (and waiting 3–4 minutes) is all you need.**

---

## Part 2: Set Up the LTI Tool

### 2.1 Clone the Repository

```bash
cd C:\tmp    # or ~/projects
git clone https://github.com/shane-downs/gators-for-honor-senior-project-2026.git LTI-Gators-for-Honor
cd LTI-Gators-for-Honor
```

### 2.2 Install Dependencies

```bash
npm install
```

### 2.3 Start MongoDB

```bash
docker compose up -d mongo
```

### 2.4 Configure Environment

```bash
# Windows:
copy .env.example .env

# Mac/Linux:
cp .env.example .env
```

Generate a secret key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `.env` in a text editor and set:

```
LTI_KEY=<paste the hex string you just generated>
LTI_PLATFORM_URL=http://localhost:3000
LTI_AUTHENTICATION_ENDPOINT=http://localhost:3000/api/lti/authorize_redirect
LTI_ACCESS_TOKEN_ENDPOINT=http://localhost:3000/login/oauth2/token
LTI_KEYSET_ENDPOINT=http://localhost:3000/api/lti/security/jwks
MONGODB_URI=mongodb://localhost:27017/canvas-seb-lti
TOOL_URL=http://localhost:3001
TOOL_PORT=3001
```

Leave `LTI_CLIENT_ID` blank for now — you'll fill it in after registering in Canvas.

### 2.5 Start the Tool

```bash
npm run dev
```

Verify: `http://localhost:3001/keys` should return a JSON object with a `keys` array.

---

## Part 3: Connect the LTI Tool to Canvas

### 3.1 Create a Developer Key

1. Go to `http://localhost:3000`, log in as admin
2. Click **Admin** in the left sidebar → select your account (e.g., "Site Admin")
3. Click **Developer Keys** in the left sidebar
4. Click **+ Developer Key** → **+ LTI Key**
5. Set **Method** to **Manual Entry**
6. Fill in the form:

| Field | Value |
|-------|-------|
| Key Name | `SEB Exam Creator` |
| Redirect URIs | `http://localhost:3001/lti/launch` |
| Title | `SEB Exam Creator` |
| Target Link URI | `http://localhost:3001/lti/launch` |
| OpenID Connect Initiation URL | `http://localhost:3001/lti/login` |
| JWK Method | Public JWK URL |
| Public JWK URL | `http://host.docker.internal:3001/keys` |

> **Why `host.docker.internal` for the JWK URL?** Canvas runs inside Docker. When it needs to fetch your tool's public keys (server-to-server), `localhost` points to the container itself, not your host machine. `host.docker.internal` is Docker Desktop's way of reaching the host. This only applies to the JWK URL — all other URLs are browser-facing and use `localhost`, since the user's browser can reach both `localhost:3000` (Canvas) and `localhost:3001` (the tool) directly.

7. Enable all **LTI Advantage Services** checkboxes
8. Under **Additional Settings**, set **Privacy Level** to **Public**
9. Under **Placements**, add **Course Navigation** with Target Link URI: `http://localhost:3001/lti/launch`
10. Click **Save**

### 3.2 Enable the Key

Back on the Developer Keys list, find your new key. Toggle the **State** switch to **ON**.

### 3.3 Copy the Client ID

The Client ID is the number shown in the Details column (e.g., `10000000000007`). Copy it.

### 3.4 Update .env

Open your `.env` file and set:

```
LTI_CLIENT_ID=10000000000007
```

(Use whatever number you actually copied.)

Restart the tool (Ctrl+C, then `npm run dev`).

### 3.5 Install in a Course

1. In Canvas, create a course (or use an existing one)
2. Go to the course → **Settings** → **Apps** tab
3. Click **View App Configurations** → **+ App**
4. Set Configuration Type to **By Client ID**
5. Paste the Client ID → **Submit** → **Install**

### 3.6 Test the Launch

1. Navigate to your course
2. Click **SEB Exam Creator** in the left sidebar
3. You should see the "LTI Launch Successful" page showing your user info and course context

If it works, your environment is fully set up.

---

## Troubleshooting

### Canvas won't start / Passenger timeout errors

If you see `A timeout occurred while starting a preloader process` in `docker compose logs web`:

1. **Check memory allocation.** Run `wsl -- free -h` (Windows) or check Docker Desktop resource settings. Canvas needs at least 8 GB available.
2. **Check the Passenger timeout fix.** Verify `entrypoint-override.sh` exists and is referenced in `docker-compose.override.yml` (step 1.7). You can verify it's applied by running:
   ```bash
   docker compose exec web grep start_timeout /usr/src/nginx/nginx.conf
   ```
   It should show `300`, not `90`.
3. **Wait longer.** After `docker compose up -d`, Canvas can take 3–4 minutes to fully boot. Don't refresh the browser repeatedly during this time.

### Canvas starts but shows 500 errors everywhere

Check the Rails log for the actual error:

```bash
docker compose exec web bash -c "tail -50 /usr/src/app/log/development.log"
```

### WSL 2 becomes unresponsive (Windows)

If Docker or WSL 2 freezes:

```powershell
wsl --shutdown
# Close Docker Desktop from the system tray
# Wait 10 seconds, then reopen Docker Desktop
```

### Missing config/redis.yml

If Canvas hangs during boot and `docker compose exec web cat /usr/src/app/config/redis.yml` returns "No such file or directory":

```bash
# Windows:
copy docker-compose\config\redis.yml config\redis.yml

# Mac/Linux:
cp docker-compose/config/redis.yml config/redis.yml
```

Then restart: `docker compose restart web`

### "Client ID is disabled"

Go to Admin → Developer Keys and toggle the key's State to ON.

### LTI launch shows 500 error / `undefined method 'sign' for nil`

Canvas can't find its LTI signing keys. This means `config/dynamic_settings.yml` is missing the `store` section. Re-copy the stock template:

```bash
# Windows:
copy docker-compose\config\dynamic_settings.yml config\dynamic_settings.yml

# Mac/Linux:
cp docker-compose/config/dynamic_settings.yml config/dynamic_settings.yml
```

Then restart Canvas: `docker compose restart web`

### Canvas can't fetch JWKS from tool

Test from inside the Canvas container:

```bash
docker compose exec web bash -c "curl http://host.docker.internal:3001/keys"
```

If that fails, your firewall may be blocking the connection. Try the Docker bridge IP instead:

```bash
docker compose exec web bash -c "curl http://172.17.0.1:3001/keys"
```

Use whichever works as the Public JWK URL in the Developer Key.

### "No Ltik or ID Token found" when visiting localhost:3001

This is expected. The tool's root URL requires an LTI launch from Canvas — you can't visit it directly in a browser. Always launch it from within Canvas.

### Module syntax errors (import/export)

All source files must use CommonJS (`require`/`module.exports`), not ES modules (`import`/`export default`). If you see `SyntaxError: Unexpected token 'export'`, change `export default` to `module.exports =` and `import X from Y` to `const X = require(Y)`.

### Docker containers show as running but `docker stats` shows dashes

Docker/WSL 2 is in a bad state. Force restart:

```powershell
wsl --shutdown
taskkill /F /IM "Docker Desktop.exe"
# Wait 10 seconds, reopen Docker Desktop
```

---

## Daily Development Workflow

Once initial setup is complete, your daily workflow is:

```bash
# Start Canvas (if not already running)
cd C:\tmp\canvas
docker compose up -d
# Wait 3-4 minutes for Canvas to boot

# Start the LTI tool
cd C:\tmp\LTI-Gators-for-Honor
npm run dev

# Open Canvas in browser
# http://localhost:3000
```

To stop everything:

```bash
cd C:\tmp\canvas
docker compose down    # Stops Canvas

# Ctrl+C in the LTI tool terminal
```

---

## Known Issues

- `/health` endpoint is behind LTI authentication (should be public) — minor, non-blocking
- `devMode` in app.js is set to `false` — set to `true` temporarily if you need debug logging for LTI issues
- The tool currently shows a static HTML page on launch — the React wizard UI is the next development milestone
- Canvas first boot on WSL 2 can take up to 5 minutes — subsequent boots are faster due to caching