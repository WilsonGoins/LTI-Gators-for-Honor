# New Developer Setup Guide

**Canvas SEB Quiz Creator in Local Development Environment**

This guide walks you through setting up the complete development environment from scratch. By the end, you'll have Canvas LMS running locally in Docker and the LTI tool connected to it. This assumes you plan to run Canvas on a local server (:3000), the LTI app backend locally (:3001), and the Next.JS frontend locally (:3002) as well.

**Time estimate:** 1–2 hours (most of it is Canvas asset compilation)

---

## Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | Runs Canvas LMS |
| [Node.js](https://nodejs.org/) | 18+ (recommend 20) | Runs the LTI tool and frontend |
| [Git](https://git-scm.com/) | Latest | Version control |
| RAM | 12 GB minimum | Docker needs ~8–10 GB for Canvas |

You will also need a [Neon](https://neon.tech) account for the PostgreSQL database (free tier is sufficient for development).

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

Go to Docker Desktop → Settings → Resources → Advanced. Ensure memory is set to at least **8 GB** (10 GB recommended).

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

> **CRITICAL:** Do not skip `redis.yml`, because Canvas will hang on startup without it. Do not skip `dynamic_settings.yml` or LTI 1.3 will not work without the signing keys it contains.

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

You'll be prompted to create an admin account. **Write down the email and password**, you'll need them to log into Canvas.

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

**This takes 15–30 minutes.** Let it run, don't Ctrl+C. When finished, you'll get your command prompt back.

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

Look for `Passenger core online` followed by successful HTTP responses. If you see `A timeout occurred while starting a preloader process`, the Passenger timeout fix from step 1.7 is not applied, so revisit that step.

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
git clone https://github.com/WilsonGoins/LTI-Gators-for-Honor
cd LTI-Gators-for-Honor
```

### 2.2 Install Dependencies

```bash
npm install
```

### 2.3 Set up the Neon Database

The application stores quiz metadata and SEB configurations in a PostgreSQL database hosted on Neon.

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project (any name, e.g., "seb-quiz-creator")
3. Select the **US East** region (or wherever is closest to you)
4. Once the project is created, go to the **Dashboard** and find your connection strings

You need two connection strings from Neon:
- **Pooled** connection string — has `-pooler` in the hostname. Used for regular queries.
- **Unpooled** (direct) connection string — no `-pooler` in the hostname. Used for transactions.

Both are available on the Neon dashboard under "Connection Details." Toggle the "Pooled connection" switch to see each version.

### 2.4 Initialize the Database Schema

The schema file creates five tables: `quizzes`, `seb_config_files`, and `seb_settings` (the core quiz and SEB configuration tables), plus `users` and `launch_sessions` (which back the per-student OAuth launch flow). The application sets `updated_at` on writes, so there are no database triggers.

**Option A — Neon SQL Editor (easiest):**
1. In the Neon dashboard, click **SQL Editor** in the left sidebar
2. Open `docs/db_initial_schema.sql` from the project, copy its entire contents
3. Paste into the SQL Editor and click **Run**

**Option B — From terminal (if you have psql installed):**
```bash
psql "$DATABASE_URL_UNPOOLED" -f docs/db_initial_schema.sql
```

Verify it worked by running this in the SQL Editor:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

You should see five rows: `quizzes`, `seb_config_files`, `seb_settings`, `users`, and `launch_sessions`.

### 2.5 Configure Environment

```bash
# Windows:
copy .env.example .env

# Mac/Linux:
cp .env.example .env
```

```
LTI_CLIENT_ID=<leave blank for now — fill in after creating the LTI key in Canvas>
CANVAS_OAUTH_CLIENT_ID=<leave blank for now — fill in after creating the OAuth API key>
CANVAS_OAUTH_CLIENT_SECRET=<leave blank for now — fill in after creating the OAuth API key>
CANVAS_URL=http://localhost:3000
TOOL_URL=http://localhost:3001
TOOL_PORT=3001
CANVAS_API_URL=http://localhost:3000/api/v1
CANVAS_ACCESS_TOKEN=<leave blank for now — fill in after generating the admin access token>
GATE_BASE_URL=http://localhost:3001/seb
DATABASE_URL=<your Neon pooled connection string>
DATABASE_URL_UNPOOLED=<your Neon unpooled connection string>
```

Most of these are filled in during Part 3, once Canvas is running and you can create the keys and token. The reason there are three separate Canvas credentials is explained in Part 3: the **LTI key** authenticates instructor launches, the **OAuth API key** authenticates the per-student login flow, and the **admin access token** lets the backend act as the admin to upload files and set access codes. They are not interchangeable.

### 2.6 Start the Backend Server

Open a terminal in the project root and run:

```bash
npm run dev
```

This starts the LTI backend on port 3001. Leave this terminal running.

Verify it's working: `http://localhost:3001/keys` should return a JSON object with a `keys` array.

### 2.7 Start the Frontend Server

Open a **second terminal** and start the frontend from the `frontend` directory inside the repo:

```bash
cd frontend    # from the project root; this is where the Next.js app lives
npm run dev
```

This starts the Next.js frontend on port 3002. Leave this terminal running as well.

Verify it's working: `http://localhost:3002` should load the frontend UI.

> **You need both terminals running simultaneously.** The backend (`:3001`) handles LTI launches and API logic. The frontend (`:3002`) serves the React UI. Stopping either will break the application.

---

## Part 3: Connect the LTI Tool to Canvas

This part creates **three separate Canvas credentials**. They are easy to confuse, so here is what each one is and why it is needed before you create them:

1. **LTI 1.3 key** (Section 3.1). Authenticates the instructor tool launch. This is what makes "Safe Exam Browser" appear in the course sidebar and lets Canvas hand the tool a signed launch token. Its identifier goes in `.env` as `LTI_CLIENT_ID`.

2. **OAuth API key** (Section 3.3). A separate Developer Key of type API, used for the per-student login flow. When a student clicks the launch link, the tool sends them through a Canvas OAuth consent screen using this key, then carries the student's token so SEB can be redirected straight into the quiz. Its ID and secret go in `.env` as `CANVAS_OAUTH_CLIENT_ID` and `CANVAS_OAUTH_CLIENT_SECRET`.

3. **Admin access token** (Section 3.5). A long-lived personal API token generated from the admin profile. The backend uses it to act as the admin for Canvas operations: setting and removing the quiz access code, setting the quiz access (unlock) and due dates, and updating the quiz title and instructions (to inject the per-student launch link). It goes in `.env` as `CANVAS_ACCESS_TOKEN`.

The LTI key uses JWT-based authentication (JWK URL, OIDC initiation, public JWK). The OAuth API key uses a shared client ID and secret. They are different kinds of keys for different jobs, and you need both, plus the token.

### 3.1 Create the LTI 1.3 Key

1. Go to `http://localhost:3000`, log in as admin
2. Click **Admin** in the left sidebar, select your account (for example "Site Admin")
3. Click **Developer Keys** in the left sidebar
4. Click **+ Developer Key**, then **+ LTI Key**
5. Set **Key Name** to `Safe Exam Browser` and **Owner Email** to your email
6. In **Redirect URIs**, enter (one per line):
   ```
   http://localhost:3001/lti/launch
   http://localhost:3001/oauth/callback
   ```
7. Set **Configure** Method to **Paste JSON** and paste the configuration below.

   > **Note on the JWK URL.** The JSON below uses `http://localhost:3001/keys`, which matches the LTI key shown in the second screenshot. If Canvas cannot fetch the tool's public keys during a launch (a 500 error referencing signing or `sign`), it is because Canvas runs inside Docker and `localhost` resolves to the container, not your host. In that case change `public_jwk_url` to `http://host.docker.internal:3001/keys`. The JWK URL is the only server-to-server URL; all other URLs are browser-facing and stay on `localhost` because the browser can reach both Canvas and the tool directly. See the troubleshooting note "Canvas can't fetch JWKS from tool" if the dry run fails.

   ```json
   {
     "title": "Safe Exam Browser",
     "description": "Create SEB-configured Canvas quizzes",
     "target_link_uri": "http://localhost:3001/lti/launch",
     "oidc_initiation_url": "http://localhost:3001/lti/login",
     "oidc_initiation_urls": {},
     "public_jwk_url": "http://localhost:3001/keys",
     "public_jwk": {},
     "custom_fields": {},
     "scopes": [],
     "extensions": [
       {
         "domain": "",
         "tool_id": "",
         "privacy_level": "anonymous",
         "platform": "canvas.instructure.com",
         "settings": {
           "platform": "canvas.instructure.com",
           "placements": [
             {
               "text": "Safe Exam Browser",
               "placement": "course_navigation",
               "message_type": "LtiResourceLinkRequest"
             }
           ]
         }
       }
     ]
   }
   ```
8. Click **Save**.

### 3.2 Enable the LTI Key and Copy Its Client ID

1. Back on the Developer Keys list, find the new key and toggle its **State** to **ON**.
2. The Client ID is the number shown in the Details column (for example `10000000000007`). Copy it.
3. Open `.env` and set:
   ```
   LTI_CLIENT_ID=10000000000007
   ```
   (Use the number you actually copied.)

### 3.3 Create the OAuth API Key

This is a second, separate Developer Key. It powers the student login flow. Do not reuse the LTI key for this.

1. Still in **Admin**, **Developer Keys**, click **+ Developer Key**, then **+ API Key** (not LTI Key).
2. Fill in the form to match the first screenshot:
   - **Key Name:** `Gators for Honor - OAuth Key`
   - **Owner Email:** your email
   - **Redirect URIs:** `http://localhost:3001/oauth/callback`
   - **Redirect URI (Legacy):** leave blank
   - **Vendor Code (LTI 2):** leave blank
   - **Icon URL:** leave blank
   - **Client Credentials Audience:** leave as **Canvas**
   - **Enforce Scopes:** leave **OFF**. With scope enforcement off, the token can reach every endpoint available to the authorizing user, which is what this flow relies on. If you turn it on, the OAuth request will fail with `invalid_scope` unless you also add an explicit scope allow-list.
3. Click **Save**.

### 3.4 Enable the OAuth Key and Copy Its ID and Secret

1. Toggle the new key's **State** to **ON**.
2. In the Details column, click **Show Key**. You will see two values:
   - **ID** is the client ID.
   - **Key** is the client secret. You can view it again later with Show Key, unlike the access token in 3.5.
3. Open `.env` and set both:
   ```
   CANVAS_OAUTH_CLIENT_ID=<the ID>
   CANVAS_OAUTH_CLIENT_SECRET=<the Key>
   ```

### 3.5 Generate the Admin Access Token (Required)

The backend cannot set access codes or read quiz unlock dates without this token, so this step is required, not optional. It can be generated at any time after the admin account exists.

1. Go to **Account**, **Settings** (this is the Approved Integrations area).
2. Scroll to **Approved Integrations** and click **+ New Access Token**.
3. Set the Purpose to something like `Safe Exam Browser Dev` and click **Generate Token**.
4. Copy the token **immediately**. Canvas will not show it again.
5. Open `.env` and set:
   ```
   CANVAS_ACCESS_TOKEN=<the token>
   ```

> If you ever lose this token, generate a new one and update `.env`. There is no way to recover the original value.

### 3.6 Restart the Backend

After filling in `LTI_CLIENT_ID`, `CANVAS_OAUTH_CLIENT_ID`, `CANVAS_OAUTH_CLIENT_SECRET`, and `CANVAS_ACCESS_TOKEN`, restart the backend so it loads the new values:

```bash
# Ctrl+C in the backend terminal, then:
npm run dev
```

The frontend does not need a restart for these backend variables.

### 3.7 Install the Tool in a Course

This uses the LTI key's Client ID from Section 3.2.

1. In Canvas, go to the course, then **Settings**, then the **Apps** tab
2. Click **View App Configurations**, then **+ App**
3. Set Configuration Type to **By Client ID**
4. Paste the LTI Client ID, click **Submit**, then **Install**

> Installing this at the account level adds the tool to all courses under that account.

### 3.8 Test the Launch

1. Navigate to your course
2. Click **Safe Exam Browser** in the left sidebar
3. You should see the "LTI Launch Successful" page showing your quizzes

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

### SSL deprecation warning from pg library

On startup you may see a `SECURITY WARNING` about SSL modes from the `pg` library. This is an informational deprecation notice about a future major version — it does not affect connectivity. You can safely ignore it.

### Docker containers show as running but `docker stats` shows dashes

Docker/WSL 2 is in a bad state. Force restart:

```powershell
wsl --shutdown
taskkill /F /IM "Docker Desktop.exe"
# Wait 10 seconds, reopen Docker Desktop
```

---

## Daily Development Workflow

Once initial setup is complete, your daily workflow requires **three things running**: Canvas (Docker), the backend, and the frontend.

```bash
# Terminal 1 — Start Canvas (if not already running)
cd C:\tmp\canvas
docker compose up -d
# Wait 3-4 minutes for Canvas to boot

# Terminal 2 — Start the LTI backend
cd C:\tmp\LTI-Gators-for-Honor
npm run dev
# Runs on http://localhost:3001

# Terminal 3 — Start the Next.js frontend
cd C:\tmp\LTI-Gators-for-Honor/frontend   #
npm run dev
# Runs on http://localhost:3002

# Then open Canvas in browser: http://localhost:3000
```

To stop everything:

```bash
# Stop Canvas
cd C:\tmp\canvas
docker compose down

# Stop the backend: Ctrl+C in Terminal 2
# Stop the frontend: Ctrl+C in Terminal 3
```

---

## Known Issues

- The `/health` endpoint is public and returns a small JSON status object — handy for confirming the backend is up at `http://localhost:3001/health`.
- There is no `devMode` flag in `app.js`; the backend logs via plain `console.log`, visible in the terminal running `npm run dev`. Adjust logging in the source if you need more or less detail.
- Canvas first boot on WSL 2 can take up to 5 minutes — subsequent boots are faster due to caching
- On the first launch, each student sees a Canvas OAuth consent screen for the OAuth API key and must authorize the tool once. This is expected behavior of the student login flow.

---

## Next Steps

This guide covers local development only. For how the tool is deployed and hosted in production (DigitalOcean droplet, Nginx, SSL, the Cloudflare Tunnel for Canvas, the domain, the deploy workflow, and the pressing maintenance issues), see `docs/MAINTENANCE.md`. For moving the tool onto UF's hosted Canvas, see `docs/UF_MIGRATION_GUIDE.md`.