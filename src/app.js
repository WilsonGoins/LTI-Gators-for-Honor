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

// successfull launch: (token has course id, user info, roles, and more)
lti.onConnect(async (token, req, res) => {
  // Log launch info for debugging
  console.log('\n========== LTI LAUNCH ==========');
  console.log('User:', token.userInfo?.name || 'Unknown');
  console.log('Email:', token.userInfo?.email || 'Unknown');
  console.log('Roles:', token.platformContext?.roles || []);
  console.log('Course ID:', token.platformContext?.context?.id || 'Unknown');
  console.log('Course Title:', token.platformContext?.context?.title || 'Unknown');
  console.log('================================\n');

  // Check if user has instructor role
  const roles = token.platformContext?.roles || [];
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
          <p>Your roles: ${roles.join(', ')}</p>
        </body>
      </html>
    `);
  }

  // Extract context we'll need throughout the session
  const context = {
    courseId: token.platformContext?.context?.id,
    courseTitle: token.platformContext?.context?.title,
    userId: token.user,
    userName: token.userInfo?.name,
    userEmail: token.userInfo?.email,
    roles: roles,
  };

  // For now, serve a simple confirmation page to be replaced by our next.js frontend later
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
            border: none;
            cursor: pointer;
            font-size: 16px;
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
          <div class="context-item"><span class="label">Instructor:</span> ${context.userName || 'N/A'}</div>
          <div class="context-item"><span class="label">Email:</span> ${context.userEmail || 'N/A'}</div>
          <div class="context-item"><span class="label">Course:</span> ${context.courseTitle || 'N/A'}</div>
          <div class="context-item"><span class="label">Course ID:</span> ${context.courseId || 'N/A'}</div>
        </div>

        <div class="context-card">
          <h3>Available Actions</h3>
          <p>These endpoints are live and ready for testing:</p>
          <div class="actions">
            <a class="btn" href="/seb/generate-test" target="_blank">Generate Test .seb File</a>
            <a class="btn btn-secondary" href="/health" target="_blank">Health Check</a>
          </div>
        </div>

        <div class="context-card">
          <h3>Next Steps</h3>
          <p>The LTI connection is working. The next development tasks are:</p>
          <ol>
            <li>Build the quiz creation wizard UI (React frontend)</li>
            <li>Connect wizard to Canvas Quiz API for quiz creation</li>
            <li>Generate .seb config files based on wizard selections</li>
            <li>Add the "Proctor with SEB" checkbox flow</li>
          </ol>
        </div>
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
