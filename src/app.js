// Entry point — manual LTI 1.3 OIDC flow (no ltijs dependency)
// Based on https://blog.devendran.in/build-lti13-tool-canvas-lms
//
// After successful LTI launch, redirects to a Next.js frontend
// and exposes /api/context so the frontend can fetch LTI session data.

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { tool, platform: platformConfig } = require('./config');

const app = express();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Secret used to sign session JWTs — in production, use a proper secret from env
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Where the Next.js dev server is running
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';

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

// CORS — allow the Next.js frontend to call our API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// In-memory stores (use Redis/DB in production)
// ---------------------------------------------------------------------------
const nonceStore = new Map();
const sessionStore = new Map(); // sessionToken → LTI context
let _privateKey;
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

  const keyObject = crypto.createPublicKey(publicKey);
  const jwk = keyObject.export({ format: 'jwk' });
  jwk.kid = 'seb-tool-key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  _privateKey = privKey;
  publicJwk = jwk;
  console.log('✅ RSA keys generated for JWKS');
}

// ---------------------------------------------------------------------------
// Helper — create a signed session token for the frontend
// ---------------------------------------------------------------------------
function createSessionToken(context) {
  const sessionId = crypto.randomUUID();
  // Store full context server-side; the token is just a handle
  sessionStore.set(sessionId, {
    ...context,
    createdAt: Date.now(),
    expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
  });
  // Sign a lightweight JWT containing only the session ID
  const token = jwt.sign({ sid: sessionId }, SESSION_SECRET, {
    expiresIn: '4h',
  });
  return token;
}

// ---------------------------------------------------------------------------
// API — Frontend fetches LTI context with the session token
// ---------------------------------------------------------------------------
app.get('/api/context', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SESSION_SECRET);
    const session = sessionStore.get(decoded.sid);

    if (!session) {
      return res.status(401).json({ error: 'Session not found or expired' });
    }
    if (session.expiresAt < Date.now()) {
      sessionStore.delete(decoded.sid);
      return res.status(401).json({ error: 'Session expired' });
    }

    // Return the LTI context to the frontend
    res.json({
      courseId: session.courseId,
      courseTitle: session.courseTitle,
      userName: session.userName,
      userEmail: session.userEmail,
      roles: session.roles,
      avatarUrl: session.avatarUrl,
      canvasUrl: session.canvasUrl,
    });
  } catch (err) {
    console.error('Context fetch error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ---------------------------------------------------------------------------
// JWKS endpoint — Canvas fetches our public key from here
// ---------------------------------------------------------------------------
app.get('/keys', (req, res) => {
  res.json({ keys: [publicJwk] });
});

app.get('/jwks.json', (req, res) => {
  res.json({ keys: [publicJwk] });
});

// ---------------------------------------------------------------------------
// Health check
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
      lti_message_hint,
      client_id,
      lti_deployment_id,
    } = req.body;

    // print debugging
    // console.log('\n========== LTI LOGIN ==========');
    // console.log('iss:', iss);
    // console.log('client_id:', client_id);
    // console.log('login_hint:', login_hint);
    // console.log('================================\n');

    if (!iss || !login_hint || !client_id) {
      return res.status(400).json({ error: 'Missing required LTI login parameters' });
    }

    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();

    nonceStore.set(state, {
      nonce,
      client_id,
      iss,
      lti_deployment_id,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const canvasUrl = platformConfig.canvasUrl || 'http://localhost:3000';
    const authUrl = new URL(`${canvasUrl}/api/lti/authorize`);
    authUrl.searchParams.append('scope', 'openid');
    authUrl.searchParams.append('response_type', 'id_token');
    authUrl.searchParams.append('response_mode', 'form_post');
    authUrl.searchParams.append('prompt', 'none');
    authUrl.searchParams.append('client_id', client_id);
    authUrl.searchParams.append('redirect_uri', `${tool.url}/lti/launch`);
    authUrl.searchParams.append('login_hint', login_hint);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('nonce', nonce);
    if (lti_message_hint) {
      authUrl.searchParams.append('lti_message_hint', lti_message_hint);
    }

    // console.log('Redirecting to Canvas authorize:', authUrl.toString());
    console.log('Redirecting to Canvas auth...');
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'LTI login failed', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// LTI Launch — Step 3 of OIDC handshake
// Canvas POSTs the id_token here after authorization.
// We validate the JWT, extract user/course info, then REDIRECT to Next.js.
// ---------------------------------------------------------------------------
app.post('/lti/launch', async (req, res) => {
  try {
    if (req.body.error) {
      throw new Error(
        `Canvas returned error: ${req.body.error} — ${req.body.error_description}`
      );
    }
    const { id_token, state } = req.body;

    console.log('LTI Launching...');
    // console.log('\n========== LTI LAUNCH ==========');
    // console.log('state:', state);
    // console.log('id_token present:', !!id_token);

    if (!id_token || !state) {
      throw new Error('Missing id_token or state');
    }

    // Validate state + nonce
    const nonceData = nonceStore.get(state);
    if (!nonceData) {
      throw new Error('Invalid state, not found in nonce store');
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

    // console.log('JWT kid:', header.kid);
    // console.log('JWT iss:', payload.iss);

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

    // console.log('✅ JWT signature verified');

    // Extract LTI claims
    const ltiContext =
      payload['https://purl.imsglobal.org/spec/lti/claim/context'] || {};
    const roles =
      payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const custom =
      payload['https://purl.imsglobal.org/spec/lti/claim/custom'] || {};

    // Debug: log the full payload so you can see exactly what Canvas sends
    // console.log('Full JWT payload keys:', Object.keys(payload));
    // console.log('given_name:', payload.given_name, '| family_name:', payload.family_name);
    // console.log('name:', payload.name, '| picture:', payload.picture);


    // Debug: dump full payload so you can see exactly what Canvas sends
    console.log('\n--- FULL JWT PAYLOAD ---');
    console.log(JSON.stringify(payload, null, 2));
    console.log('--- END PAYLOAD ---\n');


    // Canvas LTI 1.3 uses OIDC standard claims: given_name + family_name
    const userName =
      [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
      payload.name ||
      custom.user_name_full ||
      custom.person_name_full ||
      (payload['https://purl.imsglobal.org/spec/lti/claim/lis'] || {}).person_name_full ||
      payload.preferred_username ||
      (payload.sub ? `User ${payload.sub}` : 'Unknown');

    const avatarUrl =
      payload.picture ||
      custom.user_image ||
      null;

    const context = {
      courseId: ltiContext.id,
      courseTitle: ltiContext.title,
      userName,
      userEmail: payload.email || custom.user_email || 'N/A',
      roles: roles.map((r) => r.split('#').pop()),
      avatarUrl,
      canvasUrl,
    };

    // console.log('User:', context.userName);
    // console.log('Course:', context.courseTitle);
    // console.log('Roles:', context.roles.join(', '));
    // console.log('================================\n');

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

    // -----------------------------------------------------------------------
    // SUCCESS — Create session and redirect to the Next.js frontend
    // -----------------------------------------------------------------------
    const sessionToken = createSessionToken(context);

    // Redirect to the Next.js frontend with the session token
    const redirectUrl = new URL(FRONTEND_URL);
    redirectUrl.searchParams.set('token', sessionToken);

    // console.log(`✅ Redirecting to frontend: ${redirectUrl.toString()}`);
    console.log(`✅ Redirecting to frontend...`);
    return res.redirect(redirectUrl.toString());
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
// LTI info routes (development only)
// ---------------------------------------------------------------------------
const ltiRoutes = require('./routes/lti');
app.use('/lti-info', ltiRoutes);

// ---------------------------------------------------------------------------
// Root — simple status page
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>🔒 SEB Exam Creator - LTI Tool</h1>
        <p>Status: Running</p>
        <p>Frontend: <a href='${FRONTEND_URL}'>${FRONTEND_URL}</a></p>
        <p>JWKS: <a href='/keys'>/keys</a></p>
        <p>Health: <a href='/health'>/health</a></p>
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
    console.log(`   Tool URL:    ${tool.url}`);
    console.log(`   Frontend:    ${FRONTEND_URL}`);
    console.log(`   Health:      ${tool.url}/health`);
    console.log(`   JWKS:        ${tool.url}/keys`);
    console.log(`   Canvas:      ${platformConfig.canvasUrl || 'not configured'}`);
    console.log(`   Client ID:   ${platformConfig.clientId || 'not configured'}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = app;