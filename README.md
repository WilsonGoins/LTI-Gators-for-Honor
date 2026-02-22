# Canvas SEB Quiz Creator: LTI Tool

An LTI 1.3 tool that integrates Safe Exam Browser proctoring directly into Canvas LMS. Instructors can configure SEB-proctored exams without leaving Canvas or manually creating configuration files.

**Senior Design Project - University of Florida, Spring 2026**
**Team:** Wilson Goins & Shane Downs
**Advisor:** Dr. Jeremiah Blanchard

---

## Architecture

```
  Your local machine
  ═══════════════════════════════════════════════════════════

  ┌─────────────────────┐       LTI 1.3        ┌──────────────────────┐
  │  Canvas LMS         │ ────────────────────► │  SEB LTI Tool        │
  │  (Docker, port 3000)│                       │  (npm, port 3001)    │
  │  canvas-lms repo    │ ◄── REST API ──────── │  this repo           │
  └─────────────────────┘                       └──────────┬───────────┘
                                                           │
                                                  Generates .seb files
                                                  Computes Config Keys

  ┌──────────────────────┐
  │  MongoDB              │
  │  (Docker, port 27017) │  ◄── ltijs session/key storage
  └──────────────────────┘
```

- **Canvas** runs locally in Docker from the [canvas-lms](https://github.com/instructure/canvas-lms) repo
- **This LTI tool** runs locally via `npm run dev`
- **MongoDB** runs locally in Docker (started from this repo's docker-compose)
- Each developer runs everything on their own machine
- Code collaboration happens through GitHub (branches → PRs → merge → pull)

## Prerequisites

- **Docker Desktop** with at least **8GB RAM** allocated (Settings → Resources → Memory)
- **Git**
- **Node.js 18+** ([download](https://nodejs.org/))

## Setup — Step 1: Get Canvas Running Locally

```bash
git clone https://github.com/instructure/canvas-lms.git canvas
cd canvas
git checkout prod

# Automated Docker setup (30-60 min first time)
./script/docker_dev_setup.sh

# If it fails with permission errors:
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
./script/docker_dev_setup.sh
```

When prompted, create an admin account (email + password). **Write these down.**

Start Canvas:
```bash
docker compose up -d
```

Verify: open `http://localhost:3000` — you should see the Canvas login page.

## Setup — Step 2: Get the LTI Tool Running

```bash
# In a separate directory from canvas
git clone https://github.com/shane-downs/gators-for-honor-senior-project-2026.git
cd gators-for-honor-senior-project-2026

# Install Node dependencies
npm install

# Start MongoDB (runs in Docker in the background)
docker compose up -d mongo

# Configure environment
cp .env.example .env
```

Edit `.env` — generate and fill in the `LTI_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste the output as the `LTI_KEY` value. Leave `LTI_CLIENT_ID` blank for now.

Start the tool:
```bash
npm run dev
```

Verify: open `http://localhost:3001/health` — you should see `{"status":"ok",...}`.

## Setup — Step 3: Register the Tool in Canvas

Visit `http://localhost:3001/lti-info/setup` for a visual guide, or follow these steps:

1. Log in to Canvas at `http://localhost:3000` with your admin account
2. Go to **Admin → Site Admin → Developer Keys**
3. Click **+ Developer Key → LTI Key**
4. Fill in:
   - **Key Name:** `SEB Exam Creator`
   - **Target Link URI:** `http://localhost:3001/`
   - **OpenID Connect Initiation URL:** `http://localhost:3001/lti/login`
   - **JWK Method:** Public JWK URL
   - **Public JWK URL:** `http://localhost:3001/keys`
   - **Redirect URIs:** `http://localhost:3001/`
5. Save. Toggle the key to **ON**.
6. Copy the **Client ID** (long number in the key list).
7. Paste it into your `.env` as `LTI_CLIENT_ID`.
8. Restart the tool (Ctrl+C then `npm run dev` again).

### Install in a Course

1. In Canvas, create a test course (or use the default one)
2. Go to **Course → Settings → Apps → + App**
3. Configuration Type: **By Client ID**
4. Paste the Client ID → Submit
5. Click the tool in the course navigation

You should see the "LTI Launch Successful" page.

## Daily Development Workflow

Each time you sit down to work:

```bash
# Terminal 1: Start Canvas (if not already running)
cd canvas
docker compose up -d

# Terminal 2: Start MongoDB + LTI tool
cd gators-for-honor-senior-project-2026
docker compose up -d mongo
npm run dev
```

When working on code:

```bash
# Pull latest changes from GitHub
git pull

# Create a branch for your work
git checkout -b feature/my-feature

# Make changes — nodemon auto-restarts on save

# Run tests
npm test

# Commit and push
git add -A
git commit -m "feat: description of change"
git push origin feature/my-feature

# Open a PR on GitHub for your partner to review
```

## Common Commands

```bash
# View tool logs — npm run dev shows them in the terminal automatically

# Restart after changing .env
# Ctrl+C to stop, then:
npm run dev

# Stop MongoDB
docker compose down

# Run tests
npm test

# Check what Docker containers are running
docker ps
```

## Project Structure

```
├── src/
│   ├── app.js              # Entry point — ltijs setup, LTI launch handler
│   ├── config/
│   │   └── index.js        # Loads environment variables from .env
│   ├── routes/
│   │   ├── lti.js          # Setup guide / debug page
│   │   └── seb.js          # SEB file generation + Config Key endpoints
│   └── services/
│       ├── canvas.js       # Canvas REST API client (courses, quizzes)
│       └── seb.js          # Core SEB logic: presets, XML generation, Config Key
├── tests/
│   └── seb.test.js         # Unit tests for SEB module
├── docs/
│   └── UF_MIGRATION_GUIDE.md  # Guide for future deployment to UF Canvas
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI (runs tests on push/PR)
├── docker-compose.yml      # Runs MongoDB (and optionally the tool)
├── Dockerfile              # Container build for the tool (for deployment)
├── .env.example            # Environment variable template
└── .gitignore
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | LTI | Main tool launch (via Canvas) |
| `/health` | GET | None | Health check |
| `/keys` | GET | None | JWK public keys (for Canvas verification) |
| `/lti/login` | GET | OIDC | LTI OIDC initiation |
| `/lti-info/setup` | GET | None | Setup guide with Canvas registration values |
| `/seb/presets` | GET | None | List security presets |
| `/seb/generate` | POST | None | Generate .seb file download |
| `/seb/config-key` | POST | None | Compute Config Key |
| `/seb/generate-test` | GET | None | Test page with sample output |

## Documentation

- [UF Migration Guide](docs/UF_MIGRATION_GUIDE.md) — How to deploy this tool to UF's Canvas
- [Canvas API Reference](https://canvas.instructure.com/doc/api/)
- [SEB Integration Guide](https://safeexambrowser.org/developer/seb-integration.html)
- [LTI 1.3 Specification](https://www.imsglobal.org/spec/lti/v1p3/)

## License

MIT