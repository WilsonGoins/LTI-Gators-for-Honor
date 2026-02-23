// Entry point — manual LTI 1.3 OIDC flow (no ltijs dependency)
// Based on https://blog.devendran.in/build-lti13-tool-canvas-lms

const express = require('express');
const crypto = require('crypto');
const { importSPKI, exportJWK } = require('jose');
const { tool, platform: platformConfig } = require('./config');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow Canvas to iframe the tool & remove X-Frame-Options
app.use((req, res, next) => {
  const canvasUrl = platformConfig.canvasUrl || 'http://localhost:3000';
  res.setHeader(
    'Content-Security-Policy',
    `frame-ancestors 'self' ${canvasUrl} http://localhost:* http://127.0.0.1:*;`
  );
  res.removeHeader('X-Frame-Options');
  next();
});

// ---------------------------------------------------------------------------
// In-memory stores (use Redis/DB in production)
// ---------------------------------------------------------------------------
const nonceStore = new Map();
let privateKey;
let publicJwk;

// ---------------------------------------------------------------------------
// RSA key generation — tool's signing keys for JWKS
// ---------------------------------------------------------------------------
async function initializeKeys() {
  const { publicKey, privateKey: privKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cryptoPubKey = await importSPKI(publicKey, 'RS256');
  const jwk = await exportJWK(cryptoPubKey);
  jwk.kid = 'seb-tool-key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  privateKey = privKey;
  publicJwk = jwk;
  console.log('✅ RSA keys generated for JWKS');
}

// ---------------------------------------------------------------------------
// JWKS endpoint — Canvas fetches our public key from here
// ---------------------------------------------------------------------------
app.get('/keys', (req, res) => {
  res.json({ keys: [publicJwk] });
});

// Also support /jwks.json for compatibility
app.get('/jwks.json', (req, res) => {
  res.json({ keys: [publicJwk] });
});

// ---------------------------------------------------------------------------
// Health check (no auth required)
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'canvas-seb-lti',
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
  });
});

// ---------------------------------------------------------------------------
// LTI Login — Step 1 of OIDC handshake
// Canvas POSTs here when user clicks the LTI link.
// We validate params, generate state/nonce, redirect to Canvas authorize.
// ---------------------------------------------------------------------------
app.post('/lti/login', (req, res) => {
  try {
    const {
      iss,
      login_hint,
      target_link_uri,
      lti_message_hint,
      client_id,
      lti_deployment_id,
    } = req.body;

    console.log('\n========== LTI LOGIN ==========');
    console.log('iss:', iss);
    console.log('client_id:', client_id);
    console.log('login_hint:', login_hint);
    console.log('================================\n');

    if (!iss || !login_hint || !client_id) {
      return res.status(400).json({ error: 'Missing required LTI login parameters' });
    }

    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();

    // Store nonce for validation in the launch step
    nonceStore.set(state, {
      nonce,
      client_id,
      iss,
      lti_deployment_id,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
    });

    // Redirect to Canvas authorize endpoint
    const canvasUrl = platformConfig.canvasUrl || 'http://localhost:3000';
    const authUrl = new URL(`${canvasUrl}/api/lti/authorize_redirect`);
    authUrl.searchParams.append('scope', 'openid');
    authUrl.searchParams.append('response_type', 'id_token');
    authUrl.searchParams.append('response_mode', 'form_post');
    authUrl.searchParams.append('prompt', 'none');
    authUrl.searchParams.append('client_id', client_id);
    authUrl.searchParams.append('redirect_uri', `${tool.url}/lti/launch`);
    authUrl.searchParams.append('login_hint', login_hint);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('nonce', nonce);
    authUrl.searchParams.append('lti_message_hint', lti_message_hint || '');

    console.log('Redirecting to Canvas authorize:', authUrl.toString());
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'LTI login failed', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// LTI Launch — Step 3 of OIDC handshake
// Canvas POSTs the id_token here after authorization.
// We validate the JWT, extract user/course info, render the tool.
// ---------------------------------------------------------------------------
app.post('/lti/launch', async (req, res) => {
  try {
    const { id_token, state } = req.body;

    console.log('\n========== LTI LAUNCH ==========');
    console.log('state:', state);
    console.log('id_token present:', !!id_token);

    if (!id_token || !state) {
      throw new Error('Missing id_token or state');
    }

    // Validate state + nonce
    const nonceData = nonceStore.get(state);
    if (!nonceData) {
      throw new Error('Invalid state — not found in nonce store');
    }
    if (nonceData.expiresAt < Date.now()) {
      nonceStore.delete(state);
      throw new Error('State expired');
    }
    nonceStore.delete(state);

    // Decode the JWT
    const [headerEncoded, payloadEncoded, signatureEncoded] = id_token.split('.');
    if (!headerEncoded || !payloadEncoded || !signatureEncoded) {
      throw new Error('Invalid JWT format');
    }

    const header = JSON.parse(Buffer.from(headerEncoded, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString());

    console.log('JWT kid:', header.kid);
    console.log('JWT iss:', payload.iss);

    // Verify nonce
    if (payload.nonce !== nonceData.nonce) {
      throw new Error('Nonce mismatch');
    }

    // Fetch Canvas JWKS and verify signature
    const canvasUrl = platformConfig.canvasUrl || 'http://localhost:3000';
    const jwksResponse = await fetch(`${canvasUrl}/api/lti/security/jwks`);
    const jwks = await jwksResponse.json();

    const key = jwks.keys.find((k) => k.kid === header.kid);
    if (!key) {
      throw new Error(`No JWKS key found for kid: ${header.kid}`);
    }

    // Verify JWT signature
    const publicKey = await crypto.webcrypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const isValid = await crypto.webcrypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      Buffer.from(signatureEncoded, 'base64url'),
      Buffer.from(`${headerEncoded}.${payloadEncoded}`)
    );

    if (!isValid) {
      throw new Error('Invalid JWT signature');
    }

    console.log('✅ JWT signature verified');

    // Extract LTI claims
    const ltiContext = payload['https://purl.imsglobal.org/spec/lti/claim/context'] || {};
    const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const custom = payload['https://purl.imsglobal.org/spec/lti/claim/custom'] || {};

    const context = {
      courseId: ltiContext.id,
      courseTitle: ltiContext.title,
      userName: payload.name || custom.user_name_full || 'Unknown',
      userEmail: payload.email || custom.user_email || 'N/A',
      roles: roles.map((r) => r.split('#').pop()),
    };

    console.log('User:', context.userName);
    console.log('Course:', context.courseTitle);
    console.log('Roles:', context.roles.join(', '));
    console.log('================================\n');

    // Check instructor role
    const isInstructor = roles.some(
      (role) =>
        role.includes('Instructor') ||
        role.includes('Administrator') ||
        role.includes('ContentDeveloper')
    );

    if (!isInstructor) {
      return res.status(403).send(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Access Denied</h1>
            <p>This tool is only available to instructors and administrators.</p>
            <p>Your roles: ${context.roles.join(', ')}</p>
          </body>
        </html>
      `);
    }

    // Render the tool
    return res.send(`
      <html>
        <head>
          <title>SEB Exam Creator</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 0 20px;
              color: #333;
            }
            .success-banner {
              background: #d4edda;
              border: 1px solid #c3e6cb;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 24px;
            }
            .context-card {
              background: #f8f9fa;
              border: 1px solid #dee2e6;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 24px;
            }
            .context-card h3 { margin-top: 0; }
            .context-item { margin: 8px 0; }
            .label { font-weight: 600; color: #555; }
            .actions { margin-top: 24px; }
            .btn {
              display: inline-block;
              padding: 12px 24px;
              background: #0066cc;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              margin-right: 12px;
            }
            .btn:hover { background: #0052a3; }
            .btn-secondary { background: #6c757d; }
          </style>
        </head>
        <body>
          <div class="success-banner">
            ✅ <strong>LTI Launch Successful!</strong> — Tool is connected to Canvas.
          </div>

          <h1>🔒 SEB Exam Creator</h1>

          <div class="context-card">
            <h3>Launch Context</h3>
            <div class="context-item"><span class="label">Instructor:</span> ${context.userName}</div>
            <div class="context-item"><span class="label">Email:</span> ${context.userEmail}</div>
            <div class="context-item"><span class="label">Course:</span> ${context.courseTitle || 'N/A'}</div>
            <div class="context-item"><span class="label">Course ID:</span> ${context.courseId || 'N/A'}</div>
            <div class="context-item"><span class="label">Roles:</span> ${context.roles.join(', ')}</div>
          </div>

          <div class="context-card">
            <h3>Available Actions</h3>
            <div class="actions">
              <a class="btn" href="/seb/generate-test" target="_blank">Generate Test .seb File</a>
              <a class="btn btn-secondary" href="/health" target="_blank">Health Check</a>
            </div>
          </div>

          <div class="context-card">
            <h3>Next Steps</h3>
            <p>The LTI connection is working. Next tasks:</p>
            <ol>
              <li>Build the quiz creation wizard UI</li>
              <li>Connect wizard to Canvas Quiz API</li>
              <li>Generate .seb config files based on wizard selections</li>
            </ol>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>❌ LTI Launch Error</h1>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Check the tool server console for details.</p>
        </body>
      </html>
    `);
  }
});

// ---------------------------------------------------------------------------
// SEB routes (existing functionality)
// ---------------------------------------------------------------------------
const sebRoutes = require('./routes/seb');
app.use('/seb', sebRoutes);

// ---------------------------------------------------------------------------
// Root — simple status page
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>🔒 SEB Exam Creator - LTI Tool</h1>
        <p>Status: Running</p>
        <p>JWKS: <a href="/keys">/keys</a></p>
        <p>Health: <a href="/health">/health</a></p>
        <p>This tool must be launched from Canvas via LTI.</p>
      </body>
    </html>
  `);
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function start() {
  await initializeKeys();

  app.listen(tool.port, () => {
    console.log(`\n🚀 SEB Exam Creator LTI Tool running on port ${tool.port}`);
    console.log(`   Tool URL:  ${tool.url}`);
    console.log(`   Health:    ${tool.url}/health`);
    console.log(`   JWKS:      ${tool.url}/keys`);
    console.log(`   Canvas:    ${platformConfig.canvasUrl || 'not configured'}`);
    console.log(`   Client ID: ${platformConfig.clientId || 'not configured'}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = app;