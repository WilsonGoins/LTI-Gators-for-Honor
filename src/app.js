// =============================================================================
// Canvas SEB LTI Tool - Main Application
// =============================================================================
// This is the entry point for the LTI 1.3 tool. It uses ltijs to handle
// the LTI protocol (OIDC login, launch, key management) and registers
// our custom routes for SEB configuration and quiz management.
// =============================================================================

const path = require('path');
const lti = require('ltijs').Provider;
const config = require('./config');

// ---------------------------------------------------------------------------
// 1. Initialize ltijs
// ---------------------------------------------------------------------------
// ltijs handles all the LTI 1.3 plumbing for us:
//   - OIDC login flow
//   - ID token validation
//   - Session management
//   - JWK key generation and serving
//   - Deep linking
// ---------------------------------------------------------------------------

lti.setup(
  config.tool.ltiKey,
  {
    url: config.db.uri,
  },
  {
    // Application settings
    appUrl: '/',
    loginUrl: '/lti/login',
    cookies: {
      secure: false,      // Set to true in production with HTTPS
      sameSite: 'None',   // Required for LTI launches in iframes
    },
    devMode: true,         // Enables helpful debug logging - disable in production
    dynRegRoute: '/register', // Dynamic registration endpoint (optional)
    staticPath: path.join(__dirname, '..', 'public'),
  }
);

// ---------------------------------------------------------------------------
// 2. Handle Successful LTI Launch
// ---------------------------------------------------------------------------
// This fires when Canvas successfully launches our tool.
// The `token` contains all the LTI context: course ID, user info, roles, etc.
// ---------------------------------------------------------------------------

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

  // For now, serve a simple confirmation page
  // This will be replaced with the React frontend later
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

// ---------------------------------------------------------------------------
// 3. Handle Deep Linking (optional, for future use)
// ---------------------------------------------------------------------------
// Deep linking lets Canvas ask our tool to return a resource link.
// This is how the "Proctor with SEB" checkbox could work eventually.
// ---------------------------------------------------------------------------

lti.onDeepLinking(async (token, req, res) => {
  console.log('Deep Linking request received');
  // TODO: Implement deep linking for SEB resource selection
  return lti.redirect(res, '/', { newResource: true });
});

// ---------------------------------------------------------------------------
// 4. Register Custom Routes
// ---------------------------------------------------------------------------
// We mount our own Express routes on top of ltijs for:
//   - SEB configuration generation
//   - Canvas API proxy calls
//   - Health checks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 5. Start the Server & Register Canvas as a Platform
// ---------------------------------------------------------------------------

async function start() {
  // Deploy the ltijs server
  await lti.deploy({ port: config.tool.port });

  // Register Canvas as an LTI platform
  // This tells ltijs how to communicate with your Canvas instance
  if (config.platform.url && config.platform.clientId) {
    const platform = await lti.registerPlatform({
      url: config.platform.url,
      name: 'Canvas LMS',
      clientId: config.platform.clientId,
      authenticationEndpoint: config.platform.authEndpoint,
      accesstokenEndpoint: config.platform.tokenEndpoint,
      authConfig: {
        method: 'JWK_SET',
        key: config.platform.keysetEndpoint,
      },
    });

    console.log('\n✅ Canvas platform registered');
    console.log(`   Platform URL: ${config.platform.url}`);
    console.log(`   Client ID: ${config.platform.clientId}`);
  } else {
    console.log('\n⚠️  No Canvas platform configured yet.');
    console.log('   Set LTI_PLATFORM_URL and LTI_CLIENT_ID in .env');
    console.log('   The tool will start but LTI launches won\'t work.\n');
  }

  console.log(`\n🚀 SEB Exam Creator LTI Tool running on port ${config.tool.port}`);
  console.log(`   Tool URL: ${config.tool.url}`);
  console.log(`   Health:   ${config.tool.url}/health`);
  console.log(`   JWKS:     ${config.tool.url}/keys\n`);
}

start().catch((err) => {
  console.error('Failed to start LTI tool:', err);
  process.exit(1);
});
