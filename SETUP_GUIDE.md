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
| RAM | 8 GB minimum | Docker needs ~6 GB for Canvas |

**Docker Desktop settings:** Allocate at least 6 GB of RAM to Docker (Settings → Resources → Memory).

---

## Part 1: Set Up Canvas LMS Locally

### 1.1 Clone Canvas

```bash
cd C:\tmp                    # or ~/projects on Mac/Linux
git clone https://github.com/instructure/canvas-lms.git canvas
cd canvas
```

### 1.2 Copy Config Files

```bash
# Windows PowerShell:
copy config\database.yml.example config\database.yml
copy config\domain.yml.example config\domain.yml
copy config\security.yml.example config\security.yml
copy config\dynamic_settings.yml.example config\dynamic_settings.yml

# Mac/Linux:
cp config/database.yml.example config/database.yml
cp config/domain.yml.example config/domain.yml
cp config/security.yml.example config/security.yml
cp config/dynamic_settings.yml.example config/dynamic_settings.yml
```

### 1.3 Fix database.yml

Open `config/database.yml` in a text editor. Find every `host:`, `username:`, and `password:` entry and set them to:

```yaml
host: postgres
username: postgres
password: sekret
```

Also remove or comment out any `secondary:` replica config blocks and `shard` references — they aren't needed for local dev and will cause errors.

### 1.4 Enable Docker Compose Override

```bash
# Windows:
copy docker-compose.override.yml.example docker-compose.override.yml

# Mac/Linux:
cp docker-compose.override.yml.example docker-compose.override.yml
```

Edit `docker-compose.override.yml` and add port mapping to the `web` service:

```yaml
web:
  ports:
    - "3000:80"
```

### 1.5 Create an Empty .env File

The webpack service references `.env` — it just needs to exist:

```bash
# Windows PowerShell:
New-Item -Path .env -ItemType File

# Mac/Linux:
touch .env
```

### 1.6 Install Bundler Plugin

```bash
docker compose run --rm web bash -c "gem install bundler-multilock && bundle install"
```

This takes several minutes. Wait for it to complete.

### 1.7 Create the Database

```bash
docker compose run --rm web bundle exec rake db:create db:initial_setup
```

You'll be prompted to create an admin account. **Write down the email and password** — you'll need them to log into Canvas.

### 1.8 Install JavaScript Dependencies

```bash
docker compose run --rm web yarn install
```

If you get corruption errors, clear the cache and retry:

```bash
docker compose down
docker volume rm canvas_node_modules   # may fail if volume name differs; that's OK
docker compose run --rm web bash -c "yarn cache clean && yarn install --force"
```

### 1.9 Compile Assets

```bash
docker compose run --rm web bundle exec rake canvas:compile_assets_dev
```

**This takes 15–30 minutes.** Let it run — don't Ctrl+C. When finished, you'll get your command prompt back.

### 1.10 Fix LTI 1.3 Signing Keys (CRITICAL)

Self-hosted Canvas needs JWK signing keys for LTI 1.3. Check if your `dynamic_settings.yml` has them:

```bash
docker compose exec web bash -c "grep 'lti-keys' /usr/src/app/config/dynamic_settings.yml"
```

If that returns nothing (no `lti-keys` section), you need to add JWK keys. Run this command to create the file with Canvas's example keys:

```bash
docker compose exec web bash -c 'cat > /usr/src/app/config/dynamic_settings.yml << "EOF"
development:
  config:
    canvas:
      canvas:
        encryption-secret: "astringthatisactually32telerik8"
        signing-secret: "astringthatisactually32telerik8"
      lti-keys:
        jwk-past.json: "{\"p\":\"7yjEVGTsKilMEYpXXPEjDBFB_dHTVlfM9oHNP7XVywHxQ4FXbJnJqc5u29Cwz7MiXVJsqo3cAb3l3-YUNihJfMBjJSJGyzIXgGNj9oAj-VTiUoBAE1kT-V0KVv__Iz0wNvb-oFwmIuWNS8tkWiFjy43TeR5oPaJxJERMIFLHxzg7\",\"kty\":\"RSA\",\"q\":\"swuZlQi-NypxYo_VUixnFo5NHVXQB2bp84dJ4V7ukGygUFaxwwWAFgxkHdqr3EACunxGjYoFHpv68AlEVGrsOkJjF6PRMpVNdWMChZwh8fq_RYl1YfWTQOXIEkgGQP99bOp2LEq8TQ93-US-iyFUNwBxBNvrXKI_a5Y-i-gAj-n3\",\"d\":\"Ay3FhP7Cp3eSRHnNZ2jYa3X5vwthMIJdVllHakKfAhRlkChO-VKkIuPBBq6VoB5BIXZMuQiJkJ5wS8yp3BN8WDcJJPwV_lqUMM1ehcxjJnOX-qFYUPnHnNiTOCiFr0uBnFQE8UGHFmaH2PaqM1MZQF5NLy3--KZbIe5a_8WMDhDDTR5VZfKCFsnnrmJ9cOEUbIiD4ClBN5FZ-5rl33kMEWpvVJrMb9MRLWI8mVP8BPrxV7SOGzSPMoP_v_raSR_MimiNBVbCZCcXFxPRfldpf5UJ76Ho2pQZFaSNsAE_UmJ1FqXNJT_2bPQCqQ1ERk2Ql_3p7MaBBliSz_cphRp7_XQ\",\"e\":\"AQAB\",\"use\":\"sig\",\"kid\":\"sig-1530713613\",\"qi\":\"KOCAFdIh-WFnEb77SmkEJJimDQBJIy3YW-0VJbAjMnz0cL44HVFKg2NCh1IHBCW5Xeec95QShFCFfGjC31IWrAvhwmENT4h5xy_xGNg-UuLp9wZKwpFl6PnPSB1JlCmKjIWnfj9fSWM8C3p6snKZ3F2Cd7cnpDsBmm0KhkHJNU\",\"dp\":\"dNsR9j_Ui04et6ZFpFPbXA5RCBJ8GH7JajAl4MsRjZFb8dlw_6xEIJDJoVxFaW1e3LyCSEM_Fzh6gNJSVn0D-lHJgBfMHX_qVyV-0uHwWDdHPXKDjsIqcjM-jjlSaVj-T7dHa6qp8_DkEBR9rm01_t_czBYFE4TQNZ3nd3CcZ7M\",\"dq\":\"f3HWBuNzd_nDmq33xN3URll1IUlJV4FT4ItSSY5DXQB5UhPY4MHABFFjUbxIkp2w7IkB7zhRWCM1rxJ9i7O3AhLun3F1M9KmVJPt3sXRfR9vVyM_VVAi4u5MDV4RGcuo_OjE-t2RwcGe-fHJLfKzuoT3-Sqtbp7gEpjMPRzJfk\",\"n\":\"o7_eLBJSOGCIVSSMiGv5MR6KLfGr4DPUQ9t2Xv_YPm6brNXfS-qhMHNlpxERh3m4OxZtEi_4uCQcP9gFMIFiaw8EF7CGQW5dBLNLJQ2vY8E_ZE12s5nl0e2TNJJzLnriOqL_MziaCii7hsGAiV9AB_4YF7RUZOLgDl7F_YiixdRprpnHC0R5oPtF2-d64w1EJnnqJ3jL3P6gRdCJBvkDE9dUf7HfL-CqV_CqcOGwHJAhz5DDKFQ00H__xxbpTCUFdgORQHNyh45VsNT00kv3H8W1y2d1XX_MG6JFrjBFm7Sd22cBQ1Zv-m_JDKMq3Vh55eVxk8GHkQk-EUykJ-ssTmR0w\"}"
        jwk-present.json: "{\"p\":\"7yjEVGTsKilMEYpXXPEjDBFB_dHTVlfM9oHNP7XVywHxQ4FXbJnJqc5u29Cwz7MiXVJsqo3cAb3l3-YUNihJfMBjJSJGyzIXgGNj9oAj-VTiUoBAE1kT-V0KVv__Iz0wNvb-oFwmIuWNS8tkWiFjy43TeR5oPaJxJERMIFLHxzg7\",\"kty\":\"RSA\",\"q\":\"swuZlQi-NypxYo_VUixnFo5NHVXQB2bp84dJ4V7ukGygUFaxwwWAFgxkHdqr3EACunxGjYoFHpv68AlEVGrsOkJjF6PRMpVNdWMChZwh8fq_RYl1YfWTQOXIEkgGQP99bOp2LEq8TQ93-US-iyFUNwBxBNvrXKI_a5Y-i-gAj-n3\",\"d\":\"Ay3FhP7Cp3eSRHnNZ2jYa3X5vwthMIJdVllHakKfAhRlkChO-VKkIuPBBq6VoB5BIXZMuQiJkJ5wS8yp3BN8WDcJJPwV_lqUMM1ehcxjJnOX-qFYUPnHnNiTOCiFr0uBnFQE8UGHFmaH2PaqM1MZQF5NLy3--KZbIe5a_8WMDhDDTR5VZfKCFsnnrmJ9cOEUbIiD4ClBN5FZ-5rl33kMEWpvVJrMb9MRLWI8mVP8BPrxV7SOGzSPMoP_v_raSR_MimiNBVbCZCcXFxPRfldpf5UJ76Ho2pQZFaSNsAE_UmJ1FqXNJT_2bPQCqQ1ERk2Ql_3p7MaBBliSz_cphRp7_XQ\",\"e\":\"AQAB\",\"use\":\"sig\",\"kid\":\"sig-1530713613\",\"qi\":\"KOCAFdIh-WFnEb77SmkEJJimDQBJIy3YW-0VJbAjMnz0cL44HVFKg2NCh1IHBCW5Xeec95QShFCFfGjC31IWrAvhwmENT4h5xy_xGNg-UuLp9wZKwpFl6PnPSB1JlCmKjIWnfj9fSWM8C3p6snKZ3F2Cd7cnpDsBmm0KhkHJNU\",\"dp\":\"dNsR9j_Ui04et6ZFpFPbXA5RCBJ8GH7JajAl4MsRjZFb8dlw_6xEIJDJoVxFaW1e3LyCSEM_Fzh6gNJSVn0D-lHJgBfMHX_qVyV-0uHwWDdHPXKDjsIqcjM-jjlSaVj-T7dHa6qp8_DkEBR9rm01_t_czBYFE4TQNZ3nd3CcZ7M\",\"dq\":\"f3HWBuNzd_nDmq33xN3URll1IUlJV4FT4ItSSY5DXQB5UhPY4MHABFFjUbxIkp2w7IkB7zhRWCM1rxJ9i7O3AhLun3F1M9KmVJPt3sXRfR9vVyM_VVAi4u5MDV4RGcuo_OjE-t2RwcGe-fHJLfKzuoT3-Sqtbp7gEpjMPRzJfk\",\"n\":\"o7_eLBJSOGCIVSSMiGv5MR6KLfGr4DPUQ9t2Xv_YPm6brNXfS-qhMHNlpxERh3m4OxZtEi_4uCQcP9gFMIFiaw8EF7CGQW5dBLNLJQ2vY8E_ZE12s5nl0e2TNJJzLnriOqL_MziaCii7hsGAiV9AB_4YF7RUZOLgDl7F_YiixdRprpnHC0R5oPtF2-d64w1EJnnqJ3jL3P6gRdCJBvkDE9dUf7HfL-CqV_CqcOGwHJAhz5DDKFQ00H__xxbpTCUFdgORQHNyh45VsNT00kv3H8W1y2d1XX_MG6JFrjBFm7Sd22cBQ1Zv-m_JDKMq3Vh55eVxk8GHkQk-EUykJ-ssTmR0w\"}"
        jwk-future.json: "{\"p\":\"7yjEVGTsKilMEYpXXPEjDBFB_dHTVlfM9oHNP7XVywHxQ4FXbJnJqc5u29Cwz7MiXVJsqo3cAb3l3-YUNihJfMBjJSJGyzIXgGNj9oAj-VTiUoBAE1kT-V0KVv__Iz0wNvb-oFwmIuWNS8tkWiFjy43TeR5oPaJxJERMIFLHxzg7\",\"kty\":\"RSA\",\"q\":\"swuZlQi-NypxYo_VUixnFo5NHVXQB2bp84dJ4V7ukGygUFaxwwWAFgxkHdqr3EACunxGjYoFHpv68AlEVGrsOkJjF6PRMpVNdWMChZwh8fq_RYl1YfWTQOXIEkgGQP99bOp2LEq8TQ93-US-iyFUNwBxBNvrXKI_a5Y-i-gAj-n3\",\"d\":\"Ay3FhP7Cp3eSRHnNZ2jYa3X5vwthMIJdVllHakKfAhRlkChO-VKkIuPBBq6VoB5BIXZMuQiJkJ5wS8yp3BN8WDcJJPwV_lqUMM1ehcxjJnOX-qFYUPnHnNiTOCiFr0uBnFQE8UGHFmaH2PaqM1MZQF5NLy3--KZbIe5a_8WMDhDDTR5VZfKCFsnnrmJ9cOEUbIiD4ClBN5FZ-5rl33kMEWpvVJrMb9MRLWI8mVP8BPrxV7SOGzSPMoP_v_raSR_MimiNBVbCZCcXFxPRfldpf5UJ76Ho2pQZFaSNsAE_UmJ1FqXNJT_2bPQCqQ1ERk2Ql_3p7MaBBliSz_cphRp7_XQ\",\"e\":\"AQAB\",\"use\":\"sig\",\"kid\":\"sig-1530713613\",\"qi\":\"KOCAFdIh-WFnEb77SmkEJJimDQBJIy3YW-0VJbAjMnz0cL44HVFKg2NCh1IHBCW5Xeec95QShFCFfGjC31IWrAvhwmENT4h5xy_xGNg-UuLp9wZKwpFl6PnPSB1JlCmKjIWnfj9fSWM8C3p6snKZ3F2Cd7cnpDsBmm0KhkHJNU\",\"dp\":\"dNsR9j_Ui04et6ZFpFPbXA5RCBJ8GH7JajAl4MsRjZFb8dlw_6xEIJDJoVxFaW1e3LyCSEM_Fzh6gNJSVn0D-lHJgBfMHX_qVyV-0uHwWDdHPXKDjsIqcjM-jjlSaVj-T7dHa6qp8_DkEBR9rm01_t_czBYFE4TQNZ3nd3CcZ7M\",\"dq\":\"f3HWBuNzd_nDmq33xN3URll1IUlJV4FT4ItSSY5DXQB5UhPY4MHABFFjUbxIkp2w7IkB7zhRWCM1rxJ9i7O3AhLun3F1M9KmVJPt3sXRfR9vVyM_VVAi4u5MDV4RGcuo_OjE-t2RwcGe-fHJLfKzuoT3-Sqtbp7gEpjMPRzJfk\",\"n\":\"o7_eLBJSOGCIVSSMiGv5MR6KLfGr4DPUQ9t2Xv_YPm6brNXfS-qhMHNlpxERh3m4OxZtEi_4uCQcP9gFMIFiaw8EF7CGQW5dBLNLJQ2vY8E_ZE12s5nl0e2TNJJzLnriOqL_MziaCii7hsGAiV9AB_4YF7RUZOLgDl7F_YiixdRprpnHC0R5oPtF2-d64w1EJnnqJ3jL3P6gRdCJBvkDE9dUf7HfL-CqV_CqcOGwHJAhz5DDKFQ00H__xxbpTCUFdgORQHNyh45VsNT00kv3H8W1y2d1XX_MG6JFrjBFm7Sd22cBQ1Zv-m_JDKMq3Vh55eVxk8GHkQk-EUykJ-ssTmR0w\"}"
EOF'
```

Then restart Canvas:

```bash
docker compose restart
```

### 1.11 Start Canvas

```bash
docker compose up -d
```

Open `http://localhost:3000` in your browser. Log in with the admin credentials you created in step 1.7.

### 1.12 Verify LTI Signing Keys

```bash
curl http://localhost:3000/api/lti/security/jwks
```

You should see JSON with a `keys` array. If you get a 500 error, redo step 1.10.

**Canvas is now running. You only need to do steps 1.1–1.12 once. After this, `docker compose up -d` is all you need.**

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
| Redirect URIs | `http://localhost:3001` |
| Title | `SEB Exam Creator` |
| Target Link URI | `http://localhost:3001` |
| OpenID Connect Initiation URL | `http://localhost:3001/lti/login` |
| JWK Method | Public JWK URL |
| Public JWK URL | `http://host.docker.internal:3001/keys` |

> **Why `host.docker.internal`?** Canvas runs inside Docker. When it needs to fetch your tool's public keys (server-to-server), `localhost` points to the container itself, not your host machine. `host.docker.internal` is Docker Desktop's way of reaching the host. This only applies to the JWK URL — all other URLs are browser-facing and use `localhost`.

7. Enable all **LTI Advantage Services** checkboxes
8. Under **Additional Settings**, set **Privacy Level** to **Public**
9. Under **Placements**, add **Course Navigation** with Target Link URI: `http://localhost:3001`
10. Click **Save**

### 3.2 Enable the Key

Back on the Developer Keys list, find your new key. Toggle the **State** switch to **ON**.

### 3.3 Copy the Client ID

The Client ID is the number shown in the Details column (e.g., `10000000000001`). Copy it.

### 3.4 Update .env

Open your `.env` file and set:

```
LTI_CLIENT_ID=10000000000001
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

### Canvas won't start / shows errors

```bash
cd C:\tmp\canvas
docker compose down
docker compose up -d
# Wait 30-60 seconds for all services to initialize
```

### "Client ID is disabled"

Go to Admin → Developer Keys and toggle the key's State to ON.

### LTI launch shows 500 error

Canvas likely doesn't have LTI signing keys. Redo Part 1, step 1.10.

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

---

## Known Issues

- `/health` endpoint is behind LTI authentication (should be public) — minor, non-blocking
- `devMode` in app.js is set to `false` — set to `true` temporarily if you need debug logging for LTI issues
- The tool currently shows a static HTML page on launch — the React wizard UI is the next development milestone
