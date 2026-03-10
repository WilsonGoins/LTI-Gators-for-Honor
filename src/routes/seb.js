// =============================================================================
// SEB Routes
// =============================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const seb = require('../services/seb');
const { saveSEBConfig, getSEBFile, clearAccessCode } = require('../db/client');

const CANVAS_URL = process.env.CANVAS_URL;

// ---------------------------------------------------------------------------
// GET /seb/presets
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
// Generates a .seb file, saves it + settings to the DB, and returns it.
//
// Body:
//   {
//     courseId: "1",
//     quizId: "5",
//     startURL: "http://canvas.docker/courses/1/quizzes/5/take",
//     preset: "standard",
//     allowedDomains: ["canvas.docker"],
//     quitPassword: "optional",
//     overrides: {},
//     accessCode: "a1b2c3..." | null
//   }
// ---------------------------------------------------------------------------

router.post('/generate', express.json(), async (req, res) => {
  try {
    const {
      courseId, quizId,
      startURL, preset, allowedDomains, quitPassword, overrides,
      accessCode,
    } = req.body;

    if (!startURL) {
      return res.status(400).json({ error: 'startURL is required' });
    }
    if (!courseId || !quizId) {
      return res.status(400).json({ error: 'courseId and quizId are required' });
    }

    // Generate the configuration
    const config = seb.generateConfig({
      startURL,
      preset: preset || 'standard',
      allowedDomains: allowedDomains || [],
      quitPassword: quitPassword || null,
      overrides: overrides || {},
    });

    const configKey = seb.computeConfigKey(config);
    const sebFile = seb.generateSEBFile(config);
    const filename = `seb_config_${courseId}_${quizId}_${Date.now()}.seb`;

    // Save to database
    await saveSEBConfig(courseId, quizId, {
      settings: {
        securityLevel: preset || 'standard',
        allowQuit: (overrides || {}).allowQuit ?? false,
        allowScreenSharing: (overrides || {}).allowScreenSharing ?? false,
        allowVirtualMachine: (overrides || {}).allowVirtualMachine ?? false,
        allowSpellCheck: (overrides || {}).allowSpellCheck ?? false,
        browserViewMode: (overrides || {}).browserViewMode ?? 1,
        urlFilterEnabled: (overrides || {}).urlFilterEnabled ?? true,
        allowedDomains: allowedDomains || [],
        quitPasswordHash: quitPassword ? seb.hashPassword(quitPassword) : null,
      },
      fileData: sebFile,
      fileName: filename,
      configKey,
      accessCode: accessCode || null,
    });

    console.log(`✅ SEB config saved for course ${courseId}, quiz ${quizId}`);

    // Return the file as a download
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
// GET /seb/download/:courseId/:quizId
// Re-downloads a previously generated .seb file from the database.
// ---------------------------------------------------------------------------

router.get('/download/:courseId/:quizId', async (req, res) => {
  try {
    const { courseId, quizId } = req.params;
    const file = await getSEBFile(courseId, quizId);

    if (!file) {
      return res.status(404).json({ error: 'No SEB config file found for this quiz' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    res.setHeader('X-Config-Key', file.config_key);
    res.send(file.file_data);
  } catch (err) {
    console.error('SEB download error:', err);
    res.status(500).json({ error: 'Failed to download SEB config' });
  }
});

// ---------------------------------------------------------------------------
// POST /seb/config-key
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
    res.json({ configKey, configPreview: config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /seb/access-code
// Sets a randomized access code on a Canvas quiz.
// ---------------------------------------------------------------------------

router.post('/access-code', express.json(), async (req, res) => {
  try {
    const { courseId, quizId, quizType, accessCode: customCode } = req.body;

    if (!courseId || !quizId) {
      return res.status(400).json({ error: 'courseId and quizId are required' });
    }

    const canvasToken = process.env.CANVAS_ACCESS_TOKEN;
    if (!canvasToken) {
      return res.status(500).json({ error: 'Canvas access token not configured' });
    }

    // Use custom code if provided, otherwise generate random
    const accessCode = customCode || crypto.randomBytes(6).toString('hex');

    let canvasRes;
    if (quizType === 'new') {
      canvasRes = await fetch(
        `${CANVAS_URL}/api/quiz/v1/courses/${courseId}/quizzes/${quizId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${canvasToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quiz_settings: { require_student_access_code: true, student_access_code: accessCode },
          }),
        }
      );
    } else {
      canvasRes = await fetch(
        `${CANVAS_URL}/api/v1/courses/${courseId}/quizzes/${quizId}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${canvasToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ quiz: { access_code: accessCode } }),
        }
      );
    }

    if (!canvasRes.ok) {
      const errBody = await canvasRes.text();
      console.error('Canvas access code error:', canvasRes.status, errBody);
      return res.status(502).json({ error: 'Failed to set access code on Canvas', detail: `Canvas returned ${canvasRes.status}` });
    }

    console.log(`✅ Access code set for course ${courseId}, quiz ${quizId}`);
    res.json({ accessCode });
  } catch (err) {
    console.error('Access code error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /seb/access-code
// Removes access code from both Canvas and the DB.
//
// Body: { courseId, quizId, quizType }
// ---------------------------------------------------------------------------

router.delete('/access-code', express.json(), async (req, res) => {
  try {
    const { courseId, quizId, quizType } = req.body;

    if (!courseId || !quizId) {
      return res.status(400).json({ error: 'courseId and quizId are required' });
    }

    const canvasToken = process.env.CANVAS_ACCESS_TOKEN;
    if (!canvasToken) {
      return res.status(500).json({ error: 'Canvas access token not configured' });
    }

    // Remove access code from Canvas
    let canvasRes;
    if (quizType === 'new') {
      canvasRes = await fetch(
        `${CANVAS_URL}/api/quiz/v1/courses/${courseId}/quizzes/${quizId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${canvasToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quiz_settings: { require_student_access_code: false, student_access_code: '' },
          }),
        }
      );
    } else {
      canvasRes = await fetch(
        `${CANVAS_URL}/api/v1/courses/${courseId}/quizzes/${quizId}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${canvasToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ quiz: { access_code: '' } }),
        }
      );
    }

    if (!canvasRes.ok) {
      const errBody = await canvasRes.text();
      console.error('Canvas remove access code error:', canvasRes.status, errBody);
      return res.status(502).json({ error: 'Failed to remove access code from Canvas', detail: `Canvas returned ${canvasRes.status}` });
    }

    // Clear from our DB too
    await clearAccessCode(courseId, quizId);

    console.log(`✅ Access code removed for course ${courseId}, quiz ${quizId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove access code error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Test endpoints (unchanged)
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
      <html><body style="font-family: monospace; padding: 20px;">
        <h2>SEB Config Generation Test</h2>
        <h3>Config Key</h3>
        <pre style="background:#f0f0f0;padding:12px;border-radius:4px;word-break:break-all;">${configKey}</pre>
        <h3>XML Plist Output</h3>
        <pre style="background:#f0f0f0;padding:12px;border-radius:4px;overflow-x:auto;">${escapeHtml(xml)}</pre>
        <p><a href="/seb/generate-test-download">Download test .seb file</a></p>
      </body></html>
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

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = router;