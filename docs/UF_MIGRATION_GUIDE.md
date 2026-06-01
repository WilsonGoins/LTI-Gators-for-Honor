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
LTI_PLATFORM_URL=https://ufl.instructure.com
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

> **Verify before assuming.** Earlier versions of this guide listed `LTI_AUTHENTICATION_ENDPOINT`, `LTI_ACCESS_TOKEN_ENDPOINT`, and `LTI_KEYSET_ENDPOINT`. Those names are not in the current `.env.example`. The LTI library (ltijs) is configured with the platform's authorization, token, and keyset endpoints somewhere in the backend setup. Before migrating, confirm exactly where those three UF Canvas endpoints are set (in `.env`, in `config/`, or in the platform-registration call) and update them there. The UF Canvas values are:
> - Authorization: `https://ufl.instructure.com/api/lti/authorize_redirect`
> - Access token: `https://ufl.instructure.com/login/oauth2/token`
> - Keyset (JWKS): `https://ufl.instructure.com/api/lti/security/jwks`

### 3. HTTPS Requirement

UF Canvas requires all LTI tools to use HTTPS. Options:

- Host the tool on a platform that provides HTTPS (Heroku, Render, AWS with ALB)
- Use a reverse proxy like nginx with a Let's Encrypt certificate
- Use Cloudflare Tunnel

### 4. Cookie Configuration

In `src/app.js`, change the cookie settings for production:

```javascript
cookies: {
  secure: true,       // HTTPS only
  sameSite: 'None',   // Required for cross-origin LTI launches
}
```

Also set `devMode: false`.

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
- [ ] Quiz operations via Canvas API work against `ufl.instructure.com` (list quizzes, set access code, upload `.seb` file, set access date)
- [ ] Student launch flow works end to end: launch link, OAuth consent, `.seb` download, redirect into the quiz with access code applied
- [ ] Generated `.seb` files open correctly in SEB on Windows and macOS
- [ ] Config Key matches what SEB sends in request headers
- [ ] URL filters include `ufl.instructure.com` and `*.instructure.com`