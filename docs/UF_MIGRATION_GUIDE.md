# UF Canvas Migration Guide

This document describes how to migrate the Canvas SEB Quiz Creator from our self-hosted Canvas development instance to the University of Florida's Canvas environment. This is intended for future developers or UF IT staff who will deploy this tool in production.

---

## What Needs to Change

The tool itself (this Node.js application) does not change. What changes is **where it's registered** and **what URLs it uses**.

### 1. Canvas Developer Key

A new LTI Developer Key must be created in UF's Canvas instance.

**Who can do this:** UF Canvas administrators (likely UFIT or the e-Learning team).

**Values to provide them:**

| Field | Value |
|-------|-------|
| Key Name | SEB Exam Creator |
| Target Link URI | `https://YOUR_PRODUCTION_URL/` |
| OpenID Connect Initiation URL | `https://YOUR_PRODUCTION_URL/lti/login` |
| Public JWK URL | `https://YOUR_PRODUCTION_URL/keys` |

**Important:** The production URL must use HTTPS. UF Canvas will reject HTTP tool URLs.

### 2. Environment Variables

Update the `.env` file to point to UF's Canvas:

```
LTI_PLATFORM_URL=https://ufl.instructure.com
LTI_CLIENT_ID=<client ID from the UF Developer Key>
LTI_AUTHENTICATION_ENDPOINT=https://ufl.instructure.com/api/lti/authorize_redirect
LTI_ACCESS_TOKEN_ENDPOINT=https://ufl.instructure.com/login/oauth2/token
LTI_KEYSET_ENDPOINT=https://ufl.instructure.com/api/lti/security/jwks
CANVAS_API_URL=https://ufl.instructure.com/api/v1
```

### 3. HTTPS Requirement

UF Canvas requires all LTI tools to use HTTPS. Options:

- Host the tool on a platform that provides HTTPS (Heroku, Render, AWS with ALB)
- Use a reverse proxy like nginx with a Let's Encrypt certificate
- Use Cloudflare Tunnel

### 4. Cookie Configuration

In `src/app.js`, change the ltijs cookie settings for production:

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

1. **FERPA:** This tool does not store student data. It only interacts with course/quiz settings and instructor information. Confirm with UFIT that this satisfies FERPA requirements.

2. **OAuth Scopes:** The Canvas API scopes requested are listed in `.env.example`. UF admins may need to approve these scopes.

3. **Network Access:** The tool needs to reach `ufl.instructure.com` over HTTPS. If hosted behind the UF firewall, ensure outbound HTTPS to Instructure's servers is allowed.

4. **SEB Version Compatibility:** Test the generated `.seb` files with the SEB versions deployed on UF lab computers. Configuration keys and settings may differ between SEB versions.

---

## Testing Checklist for UF Deployment

- [ ] Developer Key created and enabled in UF Canvas
- [ ] Tool accessible via HTTPS at production URL
- [ ] LTI launch works from a UF Canvas course
- [ ] Instructor role check passes for UF instructor accounts
- [ ] Quiz creation via Canvas API works against `ufl.instructure.com`
- [ ] Generated `.seb` files open correctly in SEB on Windows and macOS
- [ ] Config Key matches what SEB sends in request headers
- [ ] URL filters include `ufl.instructure.com` and `*.instructure.com`
