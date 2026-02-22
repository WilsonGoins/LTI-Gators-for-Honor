# Canvas SEB Quiz Creator — LTI Tool

An LTI 1.3 tool that integrates Safe Exam Browser proctoring directly into Canvas LMS. Instructors can configure SEB-proctored exams without leaving Canvas or manually creating configuration files.

**Senior Design Project — University of Florida, Spring 2026**
**Team:** Wilson Goins & Shane Downs
**Advisor:** Dr. Jeremiah Blanchard

---

## Architecture

```
┌────────────────────┐       LTI 1.3 Launch        ┌─────────────────────┐
│                    │ ─────────────────────────────▶│                     │
│   Canvas LMS       │                               │  SEB LTI Tool       │
│   (DigitalOcean)   │◀──── Canvas REST API ────────│  (Node.js + ltijs)  │
│                    │                               │                     │
└────────────────────┘                               └────────┬────────────┘
                                                              │
                                                     Generates .seb files
                                                     Computes Config Keys
```

- **Canvas LMS** runs on a DigitalOcean Droplet (self-hosted dev instance)
- **This tool** runs separately and connects via LTI 1.3 + REST API
- **ltijs** handles all LTI protocol complexity (OIDC, JWT, key management)

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- MongoDB (local or [Atlas free tier](https://www.mongodb.com/atlas))
- A Canvas instance with admin access

### Setup

```bash
# Clone the repo
git clone https://github.com/shane-downs/gators-for-honor-senior-project-2026.git
cd gators-for-honor-senior-project-2026

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Canvas and MongoDB details

# Run in development mode (auto-restart on changes)
npm run dev
```

The tool starts at `http://localhost:3001`.

### Run with Docker

```bash
cp .env.example .env
# Edit .env
docker compose up -d
```

### Run Tests

```bash
npm test
```

## Registering the Tool in Canvas

Once the tool is running, visit `http://localhost:3001/lti-info/setup` for a step-by-step guide with the exact values to enter in Canvas.

**Quick version:**

1. Canvas Admin → Developer Keys → + Developer Key → **LTI Key**
2. Set Target Link URI to `http://YOUR_TOOL_URL/`
3. Set OIDC Initiation URL to `http://YOUR_TOOL_URL/lti/login`
4. Set Public JWK URL to `http://YOUR_TOOL_URL/keys`
5. Enable the key, copy the Client ID
6. Course → Settings → Apps → + App → By Client ID → paste ID
7. Set `LTI_CLIENT_ID` in your `.env` and restart

## Project Structure

```
├── src/
│   ├── app.js              # Entry point — ltijs setup, launch handler
│   ├── config/
│   │   └── index.js        # Environment config loader
│   ├── routes/
│   │   ├── lti.js          # LTI setup guide / debug endpoints
│   │   └── seb.js          # SEB file generation API
│   └── services/
│       ├── canvas.js       # Canvas REST API client
│       └── seb.js          # SEB config generator + Config Key computation
├── tests/
│   └── seb.test.js         # Unit tests for SEB module
├── docs/
│   └── UF_MIGRATION_GUIDE.md  # Guide for deploying to UF Canvas
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI pipeline
├── docker-compose.yml      # Run tool + MongoDB locally
├── Dockerfile
└── .env.example            # Environment variable template
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | LTI | Main tool launch (via Canvas) |
| `/health` | GET | None | Health check |
| `/keys` | GET | None | JWK public keys (for Canvas) |
| `/lti/login` | GET | OIDC | LTI OIDC initiation |
| `/lti-info/setup` | GET | None | Setup guide with config values |
| `/seb/presets` | GET | None | List security presets |
| `/seb/generate` | POST | None | Generate .seb file download |
| `/seb/config-key` | POST | None | Compute Config Key |
| `/seb/generate-test` | GET | None | Test page with sample output |

## Key Technologies

- **[ltijs](https://cvmcosta.me/ltijs/)** — LTI 1.3 framework for Node.js
- **[plist](https://www.npmjs.com/package/plist)** — XML plist generation (SEB file format)
- **Express.js** — HTTP server (bundled with ltijs)
- **MongoDB** — Session and key storage for ltijs
- **Jest** — Testing framework

## Documentation

- [UF Migration Guide](docs/UF_MIGRATION_GUIDE.md) — How to deploy this tool to UF's Canvas
- [Canvas API Reference](https://canvas.instructure.com/doc/api/)
- [SEB Integration Guide](https://safeexambrowser.org/developer/seb-integration.html)
- [LTI 1.3 Specification](https://www.imsglobal.org/spec/lti/v1p3/)

## License

MIT
