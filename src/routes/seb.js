// =============================================================================
// SEB Routes
// =============================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const FormData = require('form-data');
const seb = require('../services/seb');
const CanvasAPI = require('../services/canvas');
const { saveSEBConfig, getSEBFile, clearAccessCode, updateSEBFileLink } = require('../db/client');

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
// The .seb startURL now points to our gate (/gate/:courseId/:quizId) instead
// of directly to Canvas. The gate validates the SEB config key hash header
// and redirects to the Canvas quiz URL with the access code appended.
//
// Body:
//   {
//     courseId: "1",
//     quizId: "5",
//     canvasQuizURL: "http://canvas.docker/courses/1/quizzes/5/take",
//     preset: "standard",
//     allowedDomains: ["canvas.docker"],
//     quitPassword: "optional",
//     overrides: {},
//     accessCode: "a1b2c3..." | null
//   }
// ---------------------------------------------------------------------------

router.post('/generate', express.json(), async (req, res) => {
  const canvasToken = process.env.CANVAS_ACCESS_TOKEN;

  try {
    const {
      courseId, quizId,
      canvasQuizURL, preset, allowedDomains, quitPassword, overrides,
      accessCode, quizTitle, quizType,
    } = req.body;

    if (!courseId || !quizId) {
      return res.status(400).json({ error: 'courseId and quizId are required' });
    }
    if (!canvasQuizURL) {
      return res.status(400).json({ error: 'canvasQuizURL is required' });
    }

    // Generate the configuration — startURL is the gate, built internally
    const config = seb.generateConfig({
      courseId,
      quizId,
      preset: preset || 'standard',
      allowedDomains: allowedDomains || [],
      quitPassword: quitPassword || null,
      overrides: overrides || {},
    });

    const configKey = seb.computeConfigKey(config);
    const sebFile = seb.generateSEBFile(config);
    const baseName = (quizTitle || `quiz_${quizId}`)
      .replace(/\s*\(Requires SEB\)/gi, '')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim();
    const filename = `${baseName} (Requires SEB) - SEB Configuration File.seb`;

    // Save to database (now includes canvasQuizURL for gate redirect)
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
        quitPassword: quitPassword || null,
      },
      fileData: sebFile,
      fileName: filename,
      configKey,
      accessCode: accessCode || null,
      canvasQuizURL,
    });

    // Upload .seb file to Canvas course files
    let fileLink = null;
    try {
      await deleteOldCanvasFile(courseId, quizId, canvasToken);

      const folder = await getOrCreateSEBFolder(courseId, canvasToken);
      const canvasFile = await uploadFileToFolder(folder.id, courseId, filename, sebFile, canvasToken);
      fileLink = `${CANVAS_URL}/courses/${courseId}/files/${canvasFile.id}/download`;
      console.log(`✅ SEB file uploaded to Canvas course ${courseId} files`);
    } catch (uploadErr) {
      console.error('⚠️ Failed to upload SEB file to Canvas:', uploadErr.message);
    }

    console.log(`✅ SEB config saved for course ${courseId}, quiz ${quizId}`);

    // Save the Canvas file link to DB so cleanup can find it later
    if (fileLink) {
      try {
        await updateSEBFileLink(courseId, quizId, fileLink);
      } catch (dbErr) {
        console.error('⚠️ Failed to save file link to DB:', dbErr.message);
      }
    }

    // Update quiz title and instructions with SEB download prompt
    if (fileLink) {
      try {
        const canvasAPI = new CanvasAPI(undefined, canvasToken);
        const currentInstructions = await canvasAPI.getQuizInstructions(courseId, quizId, quizType);
        await updateQuizForSEB(courseId, quizId, quizType, quizTitle || '', currentInstructions, fileLink, canvasToken);
        console.log(`✅ Quiz title and instructions updated for course ${courseId}, quiz ${quizId}`);
      } catch (updateErr) {
        console.error('⚠️ Failed to update quiz title/instructions:', updateErr.message);
      }
    }

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
// GET /gate/:courseId/:quizId
// SEB Config Key validation gate.
//
// When SEB opens the .seb file, it requests this URL and attaches the
// x-safeexambrowser-configkeyhash header automatically. We verify that hash
// against the config key stored in the DB. If valid, we 302 redirect to the
// Canvas quiz URL with the access code appended. If invalid or missing, we
// show an error page.
//
// NOTE: If this router is mounted at /seb (app.use('/seb', router)), the
// full path becomes /seb/gate/:courseId/:quizId. Make sure the gateBaseURL
// in services/seb.js matches (e.g. "https://yourdomain.com/seb").
// ---------------------------------------------------------------------------

router.get('/gate/:courseId/:quizId', async (req, res) => {
  const { courseId, quizId } = req.params;

  // 1. Must have SEB config key hash header
  const configKeyHash = req.headers['x-safeexambrowser-configkeyhash'];
  if (!configKeyHash) {
    return res.status(403).send(`
      <html>
      <head><title>SEB Required</title></head>
      <body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;">
        <h2>Safe Exam Browser Required</h2>
        <p>This exam must be opened using Safe Exam Browser.</p>
        <p>Please download and open the <code>.seb</code> configuration file provided by your instructor.</p>
      </body>
      </html>
    `);
  }

  // 2. Look up config from DB
  let file;
  try {
    file = await getSEBFile(courseId, quizId);
  } catch (err) {
    console.error('Gate DB error:', err);
    return res.status(500).send('Internal server error.');
  }

  if (!file || !file.config_key) {
    return res.status(404).send('No SEB configuration found for this quiz.');
  }

  // 3. Reconstruct the request URL as SEB sees it
  //    Behind a reverse proxy (Vercel, Render, etc.) req.protocol and
  //    req.get('host') may not match what SEB actually requested.
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const requestURL = `${proto}://${host}${req.originalUrl}`;

  // 4. Verify config key hash: SHA256(requestURL + configKey) === header
  const isValid = seb.verifyConfigKeyHash(requestURL, file.config_key, configKeyHash);

  if (!isValid) {
    console.log(`Gate rejected: CK mismatch for course ${courseId} quiz ${quizId}`);
    return res.status(403).send(`
      <html>
      <head><title>Invalid Configuration</title></head>
      <body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;">
        <h2>Invalid SEB Configuration</h2>
        <p>Your configuration file doesn't match what's registered for this quiz.</p>
        <p>Please re-download the latest <code>.seb</code> file from Canvas and try again.</p>
      </body>
      </html>
    `);
  }

  // 5. Build redirect URL with access code
  if (!file.canvas_quiz_url) {
    return res.status(500).send('Quiz URL not configured. Contact your instructor.');
  }

  const redirectURL = new URL(file.canvas_quiz_url);
  if (file.access_code) {
    redirectURL.searchParams.set('access_code', file.access_code);
  }

  console.log(`Gate passed: course ${courseId} quiz ${quizId} -> redirecting`);
  return res.redirect(redirectURL.toString());
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// helper function to find or create the SEB folder in Canvas Files API
async function getOrCreateSEBFolder(courseId, token) {
  const folderName = 'SEB Configuration Files';
  
  // Try to find the folder by path first
  const searchRes = await fetch(
    `${CANVAS_URL}/api/v1/courses/${courseId}/folders/by_path/${encodeURIComponent(folderName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (searchRes.ok) {
    const folders = await searchRes.json();
    if (Array.isArray(folders) && folders.length > 0) {
      return folders[folders.length - 1];
    }
  }
  
  const rootRes = await fetch(
    `${CANVAS_URL}/api/v1/courses/${courseId}/folders/root`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!rootRes.ok) {
    throw new Error(`Failed to get root folder (${rootRes.status})`);
  }
  const rootFolder = await rootRes.json();
  
  const createRes = await fetch(
    `${CANVAS_URL}/api/v1/courses/${courseId}/folders`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        parent_folder_id: rootFolder.id,
      }),
    }
  );
  
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create SEB folder (${createRes.status}): ${err}`);
  }
  
  return createRes.json();
}

// helper to add file to folder
async function uploadFileToFolder(folderId, courseId, fileName, fileBuffer, token) {
  const notifyRes = await fetch(
    `${CANVAS_URL}/api/v1/courses/${courseId}/files`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fileName,
        parent_folder_id: folderId,
        content_type: 'application/octet-stream',
        size: fileBuffer.length,
        on_duplicate: 'overwrite',
      }),
    }
  );

  if (!notifyRes.ok) {
    const err = await notifyRes.text();
    throw new Error(`Canvas file notify failed (${notifyRes.status}): ${err}`);
  }

  const { upload_url, upload_params } = await notifyRes.json();

  const form = new FormData();
  for (const [key, value] of Object.entries(upload_params)) {
    form.append(key, String(value));
  }
  form.append('file', fileBuffer, {
    filename: fileName,
    contentType: 'application/octet-stream',
  });

  const uploadRes = await fetch(upload_url, {
    method: 'POST',
    body: form.getBuffer(),
    headers: form.getHeaders(),
    redirect: 'manual',
  });

  if (uploadRes.status === 301 || uploadRes.status === 302 || uploadRes.status === 303) {
    const confirmUrl = uploadRes.headers.get('Location');
    const confirmRes = await fetch(confirmUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!confirmRes.ok) {
      throw new Error(`Canvas file confirm failed (${confirmRes.status})`);
    }
    return confirmRes.json();
  }

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Canvas file upload failed (${uploadRes.status}): ${err}`);
  }

  return uploadRes.json();
}

// update quiz title and instructions to include SEB download link
async function updateQuizForSEB(courseId, quizId, quizType, currentTitle, currentInstructions,fileLink, token) {
  const newTitle = currentTitle.includes('Requires SEB')
    ? currentTitle
    : `${currentTitle} (Requires SEB)`;

  const sebInstructions = `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin-top: 0; color: #856404;">⚠️ This exam requires Safe Exam Browser (SEB)</h3>
      <p style="margin-bottom: 8px;">You must use Safe Exam Browser to take this exam. Please complete these steps <strong>before</strong> the exam:</p>
      <ol style="margin-bottom: 12px;">
        <li>If you haven't already, <a href="https://safeexambrowser.org/download_en.html" target="_blank">download and install Safe Exam Browser</a>.</li>
        <li><a href="${fileLink}"><strong>Download the SEB Configuration File</strong></a> for this exam.</li>
        <li>When you are ready to begin, double-click the downloaded <code>.seb</code> file to launch Safe Exam Browser.</li>
      </ol>
      <p style="margin: 0; font-size: 0.9em; color: #856404;">If you experience technical issues, contact your instructor before the exam deadline.</p>
    </div>
  `.trim();

  let canvasRes;

  const cleanedInstructions = currentInstructions
    ? currentInstructions.replace(/<div style="background-color: #fff3cd;[\s\S]*?<\/div>\s*/i, '').trim()
    : '';

  const finalInstructions = cleanedInstructions
    ? `${sebInstructions}\n${cleanedInstructions}`
    : sebInstructions;

  if (quizType === 'new') {
    canvasRes = await fetch(
      `${CANVAS_URL}/api/quiz/v1/courses/${courseId}/quizzes/${quizId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle,
          instructions: finalInstructions,
        }),
      }
    );
  } else {
    canvasRes = await fetch(
      `${CANVAS_URL}/api/v1/courses/${courseId}/quizzes/${quizId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quiz: {
            title: newTitle,
            description: finalInstructions,
          },
        }),
      }
    );
  }

  if (!canvasRes.ok) {
    const errBody = await canvasRes.text();
    throw new Error(`Canvas quiz update failed (${canvasRes.status}): ${errBody}`);
  }

  return canvasRes.json();
}

// Delete old Canvas file using stored file_link before uploading a new one
async function deleteOldCanvasFile(courseId, quizId, token) {
  const oldFile = await getSEBFile(courseId, quizId);
  if (!oldFile?.file_link) return;

  const match = oldFile.file_link.match(/\/files\/(\d+)\//);
  if (!match) return;

  const fileId = match[1];
  try {
    const delRes = await fetch(`${CANVAS_URL}/api/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (delRes.ok) {
      console.log(`✅ Deleted old Canvas file ${fileId} before re-upload`);
    } else {
      console.warn(`⚠️ Failed to delete old Canvas file ${fileId} (${delRes.status})`);
    }
  } catch (err) {
    console.warn(`⚠️ Error deleting old Canvas file: ${err.message}`);
  }
}


module.exports = router;