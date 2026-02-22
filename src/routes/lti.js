// =============================================================================
// LTI Debug/Info Routes
// =============================================================================
// Helper endpoints for development — shows LTI connection status and
// setup instructions for registering the tool in Canvas.
// =============================================================================

const express = require('express');
const router = express.Router();
const config = require('../config').default;

// ---------------------------------------------------------------------------
// GET /lti-info/setup
// Shows the configuration values needed to register this tool in Canvas.
// This is the page you'd reference when creating the Developer Key.
// ---------------------------------------------------------------------------

router.get('/setup', (req, res) => {
  const toolUrl = config.tool.url;

  res.type('html').send(`
    <html>
      <head>
        <title>LTI Tool Setup Guide</title>
        <style>
          body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
          .card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 16px 0; }
          .field { margin: 12px 0; }
          .label { font-weight: 600; color: #555; display: block; margin-bottom: 4px; }
          .value { background: #fff; border: 1px solid #ccc; padding: 8px 12px; border-radius: 4px; font-family: monospace; word-break: break-all; }
          .step { margin: 20px 0; }
          .step h3 { color: #0066cc; }
          code { background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <h1>🔧 LTI Tool Registration Guide</h1>
        <p>Use these values when creating a Developer Key in your Canvas instance.</p>

        <div class="step">
          <h3>Step 1: Create a Developer Key in Canvas</h3>
          <ol>
            <li>Go to <strong>Admin → Site Admin → Developer Keys</strong></li>
            <li>Click <strong>+ Developer Key → LTI Key</strong></li>
            <li>Fill in the fields below</li>
          </ol>
        </div>

        <div class="card">
          <h3>Developer Key Configuration Values</h3>

          <div class="field">
            <span class="label">Key Name</span>
            <div class="value">SEB Exam Creator</div>
          </div>

          <div class="field">
            <span class="label">Title</span>
            <div class="value">Safe Exam Browser Exam Creator</div>
          </div>

          <div class="field">
            <span class="label">Description</span>
            <div class="value">Create Canvas quizzes with integrated Safe Exam Browser configuration</div>
          </div>

          <div class="field">
            <span class="label">Target Link URI</span>
            <div class="value">${toolUrl}/</div>
          </div>

          <div class="field">
            <span class="label">OpenID Connect Initiation URL</span>
            <div class="value">${toolUrl}/lti/login</div>
          </div>

          <div class="field">
            <span class="label">JWK Method</span>
            <div class="value">Public JWK URL</div>
          </div>

          <div class="field">
            <span class="label">Public JWK URL</span>
            <div class="value">${toolUrl}/keys</div>
          </div>

          <div class="field">
            <span class="label">Redirect URIs</span>
            <div class="value">${toolUrl}/</div>
          </div>
        </div>

        <div class="step">
          <h3>Step 2: Enable the Key</h3>
          <p>After creating the key, toggle it to <strong>ON</strong> in the Developer Keys list.</p>
          <p>Copy the <strong>Client ID</strong> (a long number) — you'll need it for your <code>.env</code> file.</p>
        </div>

        <div class="step">
          <h3>Step 3: Install in a Course</h3>
          <ol>
            <li>Go to your test course → <strong>Settings → Apps → + App</strong></li>
            <li>Configuration Type: <strong>By Client ID</strong></li>
            <li>Paste the Client ID from Step 2</li>
            <li>Click Submit</li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 4: Update Your .env</h3>
          <p>Set <code>LTI_CLIENT_ID</code> to the Client ID from Step 2, then restart the tool.</p>
        </div>
        
        <div class="card">
          <h3>Current Tool Status</h3>
          <div class="field">
            <span class="label">Tool URL</span>
            <div class="value">${toolUrl}</div>
          </div>
          <div class="field">
            <span class="label">Platform URL</span>
            <div class="value">${config.platform.url || '⚠️ Not configured'}</div>
          </div>
          <div class="field">
            <span class="label">Client ID</span>
            <div class="value">${config.platform.clientId || '⚠️ Not configured'}</div>
          </div>
        </div>
      </body>
    </html>
  `);
});

module.exports = router;
