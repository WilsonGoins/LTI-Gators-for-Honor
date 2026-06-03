# UF Canvas Migration Guide

This document describes how to migrate the Canvas SEB Quiz Creator from our self-hosted Canvas development instance to the University of Florida's Canvas environment. This is intended for future developers or UF IT staff who will deploy this tool in production.

For how the tool is currently deployed and hosted (the DigitalOcean droplet, Nginx, SSL, the domain, and the Cloudflare Tunnel that exposes the local Canvas), see `docs/MAINTENANCE.md`. The biggest win from this migration is that pointing the tool at UF's hosted Canvas removes the local Docker Canvas and the Cloudflare Tunnel entirely. Today the tool talks to a laptop's Canvas through `canvas-dev.gatorsforhonor.app`; after migration it talks directly to `ufl.instructure.com`, with no tunnel and no laptop dependency.

---

## What Needs to Change

The tool itself (this Node.js application) does not change. What changes is **where it's registered** and **what URLs it uses**.

### 1. Canvas Developer Keys

Two Developer Keys must be created in UF's Canvas instance, matching the two created locally (see SETUP_GUIDE.md, Part 3).

**Who can do this:** UF Canvas administrators (likely UFIT or the e-Learning team).

**Key 1, the LTI 1.3 key**, makes the tool appear in the course sidebar and authenticates instructor launches.

| Field | Value |
|-------|-------|
| Key Name | SEB Exam Creator |
| Target Link URI | `https://YOUR_PRODUCTION_URL/lti/launch` |
| OpenID Connect Initiation URL | `https://YOUR_PRODUCTION_URL/lti/login` |
| Public JWK URL | `https://YOUR_PRODUCTION_URL/keys` |
| Redirect URIs | `https://YOUR_PRODUCTION_URL/lti/launch` and `https://YOUR_PRODUCTION_URL/oauth/callback` |
| Placement | `course_navigation` |

The full JSON to paste is in SETUP_GUIDE.md Section 3.1; just replace the localhost URLs with the production URL.

**Key 2, the OAuth API key**, powers the per-student login flow. Create it as an API key (not an LTI key). Its Redirect URI must be `https://YOUR_PRODUCTION_URL/oauth/callback`. Provide its client ID and secret to whoever sets `.env`.

**Important:** The production URL must use HTTPS. UF Canvas will reject HTTP tool URLs.

### 2. Environment Variables

Update the `.env` file to point at UF's Canvas. These are the variables that actually exist in `.env.example`:

```
LTI_CLIENT_ID=<client ID from the UF LTI Developer Key>
CANVAS_OAUTH_CLIENT_ID=<client ID from the UF OAuth API key>
CANVAS_OAUTH_CLIENT_SECRET=<secret from the UF OAuth API key>
CANVAS_URL=https://ufl.instructure.com
CANVAS_API_URL=https://ufl.instructure.com/api/v1
CANVAS_ACCESS_TOKEN=<admin or service-account access token in UF Canvas>
TOOL_URL=https://YOUR_PRODUCTION_URL
GATE_BASE_URL=https://YOUR_PRODUCTION_URL/seb
```

`DATABASE_URL` and `DATABASE_URL_UNPOOLED` stay pointed at the same Neon database unless UF requires the data to live elsewhere.

> **No LTI library endpoints to configure.** This tool does not use the ltijs library. It implements the LTI 1.3 OIDC handshake by hand in `src/app.js`: it generates its own signing keys at startup, serves them at `/keys`, reads the issuer from the launch request Canvas sends, and fetches Canvas's public keys directly from `CANVAS_URL` + `/api/lti/security/jwks` to verify each launch. Because the JWKS location is derived from `CANVAS_URL`, there are no separate authorization, token, or keyset endpoint variables to set. Pointing `CANVAS_URL` and `CANVAS_API_URL` at `ufl.instructure.com` is what redirects the LTI flow to UF Canvas. (If a future maintainer rewrites this on top of the ltijs library instead, that library does require the platform's issuer and its authorization, token, and keyset endpoints at registration time. Those UF Canvas values would be `https://ufl.instructure.com/api/lti/authorize_redirect`, `https://ufl.instructure.com/login/oauth2/token`, and `https://ufl.instructure.com/api/lti/security/jwks`.)

### 3. HTTPS Requirement

UF Canvas requires all LTI tools to use HTTPS. Options:

- Host the tool on a platform that provides HTTPS (Heroku, Render, AWS with ALB)
- Use a reverse proxy like nginx with a Let's Encrypt certificate
- Use Cloudflare Tunnel

### 4. Cross-Origin and Cookie Settings for Production

Earlier versions of this guide referenced an ltijs-style `cookies: { secure, sameSite }` block and a `devMode` flag. Those do not exist in this codebase (`src/app.js` does not use ltijs). The real cross-origin pieces to check for a production, cross-site deployment are:

- **CSP `frame-ancestors`** in `src/app.js`. The tool sets `Content-Security-Policy: frame-ancestors 'self' <canvasUrl> http://localhost:* ...` so Canvas can iframe it. For UF, confirm this allows `https://ufl.instructure.com` (it is derived from `CANVAS_URL`, so repointing `CANVAS_URL` should cover it, but verify the localhost entries are acceptable to leave in or should be removed for production).
- **CORS `Access-Control-Allow-Origin`** in `src/app.js`, which is set from `FRONTEND_URL`. Make sure `FRONTEND_URL` is set to the production frontend origin so the browser allows the frontend to call the backend.
- **OAuth cookies** used by the student launch flow are set in `src/routes/launch.js`. There are three: `canvas_oauth_state` and `canvas_oauth_return_to` (set just before redirecting to Canvas) and `canvas_user` (set after a successful token exchange). All three are currently created with `sameSite: 'lax'` and `secure: process.env.NODE_ENV === 'production'`. **This will break the OAuth round-trip in a cross-domain UF deployment** and must be changed. When the tool (e.g. `gatorsforhonor.app`) and Canvas (`ufl.instructure.com`) are on different domains, the browser will not send a `SameSite=Lax` cookie back on the cross-site redirect from Canvas to the tool's `/oauth/callback`, so the state-match check (`storedState !== state`) fails and the launch is rejected. For a cross-domain deployment, change those cookies to `sameSite: 'none'`. Browsers require `Secure` whenever `SameSite=None`, so you must also ensure the `secure` flag is actually on, which means setting `NODE_ENV=production` on the droplet (see below). In short: set `NODE_ENV=production` **and** change `sameSite` from `'lax'` to `'none'` on the three cookies in `routes/launch.js`.

There is no `devMode` flag to toggle. The backend logs via plain `console.log`; adjust verbosity in the source if needed.

---

## Hosting Recommendations for UF

### Option A: UF-Hosted VM

If UFIT provides a VM, use Docker Compose to run the tool:

```bash
docker compose -f docker-compose.yml up -d
```

Put nginx in front of it for HTTPS termination.

### Option B: Cloud Hosting (Heroku/Render)

These platforms provide HTTPS automatically. The free/hobby tiers may be sufficient for a single-department deployment.

### Option C: UFIT Shared Hosting

If UFIT offers Node.js hosting, deploy the `src/` directory with `npm start`.

---

## UF-Specific Considerations

1. **FERPA:** The tool does not store quiz responses, grades, or other academic records. It does, however, store a per-student Canvas OAuth refresh token (and related token data) in the `users` table to support the student launch flow, and it stores quiz and SEB configuration metadata. Confirm with UFIT whether storing student OAuth tokens in the Neon database satisfies FERPA and UF data-handling requirements, or whether the database needs to move to UF-managed infrastructure. This is a question to raise explicitly rather than assume.

2. **OAuth Scopes:** The Canvas API scopes requested are listed in `.env.example`. UF admins may need to approve these scopes.

3. **Network Access:** The tool needs to reach `ufl.instructure.com` over HTTPS. If hosted behind the UF firewall, ensure outbound HTTPS to Instructure's servers is allowed.

4. **SEB Version Compatibility:** Test the generated `.seb` files with the SEB versions deployed on UF lab computers. Configuration keys and settings may differ between SEB versions.

---

## Testing Checklist for UF Deployment

- [ ] LTI 1.3 Developer Key created and enabled in UF Canvas
- [ ] OAuth API Developer Key created and enabled in UF Canvas
- [ ] `.env` updated with both keys, the admin/service token, and UF Canvas URLs
- [ ] Tool accessible via HTTPS at production URL
- [ ] LTI launch works from a UF Canvas course
- [ ] Instructor role check passes for UF instructor accounts
- [ ] Quiz operations via Canvas API work against `ufl.instructure.com` (list quizzes, set and remove access code, read quiz access/unlock date)
- [ ] Student `.seb` delivery works: the launch flow streams a per-student `.seb` file from the tool
- [ ] Student launch flow works end to end: launch link, OAuth consent, `.seb` download, redirect into the quiz with access code applied
- [ ] Generated `.seb` files open correctly in SEB on Windows and macOS
- [ ] Config Key matches what SEB sends in request headers
- [ ] URL filters include `ufl.instructure.com` and `*.instructure.com`