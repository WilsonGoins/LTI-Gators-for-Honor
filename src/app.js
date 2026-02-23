// Entry point for our LTI 1.3 tool using ltijs

const { join } = require('path');
const lti = require('ltijs').Provider;
const { tool, db, platform: _platform } = require('./config');

// Initialize ltijs with our tool config and db to handle login flow, token validation, sessions
lti.setup(
  tool.ltiKey,
  {
    url: db.uri,    
  },
  {
    // Application settings
    appUrl: '/',
    loginUrl: '/lti/login',
    cookies: {
      secure: false,      // Set to true in production with HTTPS
      sameSite: 'Lax',      // changed from "None" 
    },
    devMode: true,     
    dynRegRoute: '/register',
    staticPath: join(__dirname, '..', 'public'),
  }
);


// print debugging
lti.app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  console.log(`[REQ] Query:`, req.query);
  next();
});


lti.onConnect(async (token, req, res) => {
  // Log what we actually received
  console.log('\n========== LTI LAUNCH ==========');
  console.log('Token type:', typeof token);
  console.log('Token:', JSON.stringify(token, null, 2));
  console.log('res.locals.token:', JSON.stringify(res.locals?.token, null, 2));
  console.log('res.locals.context:', JSON.stringify(res.locals?.context, null, 2));
  console.log('================================\n');

  // Just show success for now
  return res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>✅ LTI Launch Successful!</h1>
        <h3>Token Data:</h3>
        <pre>${JSON.stringify(token, null, 2)}</pre>
        <h3>res.locals.token:</h3>
        <pre>${JSON.stringify(res.locals?.token, null, 2)}</pre>
        <h3>res.locals.context:</h3>
        <pre>${JSON.stringify(res.locals?.context, null, 2)}</pre>
      </body>
    </html>
  `);
});


// deep linking endpoint - Canvas will call this when instructor clicks "Proctor with SEB" checkbox in quiz settings
lti.onDeepLinking(async (token, req, res) => {
  console.log('Deep Linking request received');
  // TODO: Implement deep linking for SEB resource selection
  return lti.redirect(res, '/', { newResource: true });
});


// custom routes are defined in src/routes/ and imported here to keep things organized
const sebRoutes = require('./routes/seb');
const ltiRoutes = require('./routes/lti');

lti.app.use('/seb', sebRoutes);
lti.app.use('/lti-info', ltiRoutes);

// Health check endpoint (no auth required)
lti.app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'canvas-seb-lti',
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
  });
});


// start server and register Canvas as an LTI platform if configured
async function start() {
  lti.whitelist(lti.appRoute(), { route: new RegExp(/^\/lti\/login/), method: 'POST' });

  // Deploy the ltijs server
  await lti.deploy({ port: tool.port });

  // Register Canvas as an LTI platform, so it can launch our tool
  if (_platform.url && _platform.clientId) {
    const platform = await lti.registerPlatform({
      url: _platform.url,
      name: 'Canvas LMS',
      clientId: _platform.clientId,
      authenticationEndpoint: _platform.authEndpoint,
      accesstokenEndpoint: _platform.tokenEndpoint,
      authConfig: {
        method: 'JWK_SET',
        key: _platform.keysetEndpoint,
      },
    });

    console.log('\n✅ Canvas platform registered');
    console.log(`   Platform URL: ${_platform.url}`);
    console.log(`   Client ID: ${_platform.clientId}`);
  } else {
    console.log('\n⚠️  No Canvas platform configured yet.');
    console.log('   Set LTI_PLATFORM_URL and LTI_CLIENT_ID in .env');
    console.log('   The tool will start but LTI launches won\'t work.\n');
  }

  console.log(`\n🚀 SEB Exam Creator LTI Tool running on port ${tool.port}`);
  console.log(`   Tool URL: ${tool.url}`);
  console.log(`   Health:   ${tool.url}/health`);
  console.log(`   JWKS:     ${tool.url}/keys\n`);
}

start().catch((err) => {
  console.error('Failed to start LTI tool:', err);
  process.exit(1);
});
