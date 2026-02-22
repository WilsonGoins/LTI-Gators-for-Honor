// =============================================================================
// SEB Routes
// =============================================================================
// Endpoints for generating SEB configuration files, computing config keys,
// and listing available security presets.
// =============================================================================

const express = require('express');
const router = express.Router();
const seb = require('../services/seb');

// ---------------------------------------------------------------------------
// GET /seb/presets
// Returns the available security presets for the wizard dropdown.
// ---------------------------------------------------------------------------

router.get('/presets', (req, res) => {
  const presets = Object.entries(seb.SECURITY_PRESETS).map(([key, value]) => ({
    id: key,
    name: value.name,
    description: value.description,
  }));
  res.json({ presets });
});

// ---------------------------------------------------------------------------
// POST /seb/generate
// Generates a .seb file and returns it as a download.
//
// Body:
//   {
//     startURL: "http://canvas:3000/courses/1/quizzes/1/take",
//     preset: "standard",
//     allowedDomains: ["canvas.example.edu"],
//     quitPassword: "optional-password",
//     overrides: {}  // optional manual SEB setting overrides
//   }
// ---------------------------------------------------------------------------

router.post('/generate', express.json(), (req, res) => {
  try {
    const { startURL, preset, allowedDomains, quitPassword, overrides } = req.body;

    if (!startURL) {
      return res.status(400).json({ error: 'startURL is required' });
    }

    // Generate the configuration
    const config = seb.generateConfig({
      startURL,
      preset: preset || 'standard',
      allowedDomains: allowedDomains || [],
      quitPassword: quitPassword || null,
      overrides: overrides || {},
    });

    // Compute the Config Key
    const configKey = seb.computeConfigKey(config);

    // Generate the .seb file buffer
    const sebFile = seb.generateSEBFile(config);

    // Build a filename from the URL
    const filename = `exam_config_${Date.now()}.seb`;

    // Return both the file and the config key
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Config-Key', configKey);
    res.send(sebFile);
  } catch (err) {
    console.error('SEB generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /seb/config-key
// Computes and returns the Config Key for a given configuration.
// Useful for the review screen in the wizard.
//
// Body: same as /generate
// ---------------------------------------------------------------------------

router.post('/config-key', express.json(), (req, res) => {
  try {
    const { startURL, preset, allowedDomains, quitPassword, overrides } = req.body;

    const config = seb.generateConfig({
      startURL: startURL || 'http://placeholder.url',
      preset: preset || 'standard',
      allowedDomains: allowedDomains || [],
      quitPassword: quitPassword || null,
      overrides: overrides || {},
    });

    const configKey = seb.computeConfigKey(config);

    res.json({
      configKey,
      configPreview: config,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /seb/generate-test
// Quick test endpoint — generates a sample .seb file with defaults.
// Useful for verifying the generation pipeline works.
// ---------------------------------------------------------------------------

router.get('/generate-test', (req, res) => {
  try {
    const config = seb.generateConfig({
      startURL: 'http://canvas.example.edu/courses/1/quizzes/1/take',
      preset: 'standard',
      allowedDomains: ['canvas.example.edu'],
    });

    const configKey = seb.computeConfigKey(config);
    const xml = seb.configToXML(config);

    res.type('html').send(`
      <html>
        <head><title>SEB Test Output</title></head>
        <body style="font-family: monospace; padding: 20px;">
          <h2>SEB Config Generation Test</h2>
          
          <h3>Config Key</h3>
          <pre style="background: #f0f0f0; padding: 12px; border-radius: 4px; word-break: break-all;">${configKey}</pre>
          
          <h3>XML Plist Output</h3>
          <pre style="background: #f0f0f0; padding: 12px; border-radius: 4px; overflow-x: auto;">${escapeHtml(xml)}</pre>
          
          <h3>Download</h3>
          <p>
            <a href="/seb/generate-test-download">Download test .seb file</a>
          </p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

router.get('/generate-test-download', (req, res) => {
  const config = seb.generateConfig({
    startURL: 'http://canvas.example.edu/courses/1/quizzes/1/take',
    preset: 'standard',
    allowedDomains: ['canvas.example.edu'],
  });

  const sebFile = seb.generateSEBFile(config);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="test_exam.seb"');
  res.send(sebFile);
});

// Helper to escape HTML for display
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = router;
