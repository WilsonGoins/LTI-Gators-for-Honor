// =============================================================================
// Launch + OAuth Routes
// =============================================================================
//
// Flow:
//   1. Student clicks link in Canvas quiz instructions → GET /launch/:quizId
//   2. If no refresh token on file → redirect to Canvas OAuth consent
//   3. Canvas redirects back → GET /oauth/callback → store token → redirect
//      back to /launch/:quizId/download (step 3 of the implementation plan)
// =============================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const config = require('../config');
const seb = require('../services/seb');
const {
  getUserByCanvasId,
  upsertUser,
  getSEBConfigForStudent,
  createLaunchSession,
  updateLaunchSessionConfigKey,
} = require('../db/client');

const CANVAS_URL = config.platform.canvasUrl;
const CLIENT_ID = process.env.CANVAS_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CANVAS_OAUTH_CLIENT_SECRET;
const TOOL_URL = config.tool.url;


// Fetch the quiz's current unlock_at from Canvas. Returns an ISO-8601 string
// or null if no unlock date is set. Throws on Canvas API failure.
//
// We use the admin Canvas token here (same pattern as updateQuizForSEB in
// routes/seb.js) rather than the student's refreshed OAuth token. This keeps
// the check fast (no token refresh) and avoids exposing students' tokens to
// extra API surface area.
async function fetchQuizUnlockAt(courseId, quizId) {
  const canvasToken = process.env.CANVAS_ACCESS_TOKEN;
  if (!canvasToken) return null;  // Without admin token we can't enforce; fail open with warning logged elsewhere.

  // Try the New Quizzes endpoint first; fall back to Classic on 404.
  // The shape differs slightly but the unlock_at field is at the top level for both.
  let res = await fetch(
    `${CANVAS_URL}/api/quiz/v1/courses/${courseId}/quizzes/${quizId}`,
    { headers: { Authorization: `Bearer ${canvasToken}` } }
  );
  if (res.status === 404) {
    res = await fetch(
      `${CANVAS_URL}/api/v1/courses/${courseId}/quizzes/${quizId}`,
      { headers: { Authorization: `Bearer ${canvasToken}` } }
    );
  }
  if (!res.ok) {
    throw new Error(`Canvas quiz lookup failed (${res.status})`);
  }
  const data = await res.json();
  return data.unlock_at || null;
}


// ---------------------------------------------------------------------------
// GET /launch/file/:launchToken
// Streams the .seb file for a specific launch session. Called by the
// landing page's auto-download, not by students directly.
// ---------------------------------------------------------------------------
router.get('/launch/file/:launchToken', async (req, res) => {
  const { launchToken } = req.params;

  try {
    const { rows } = await require('../db/client').pool.query(
      `SELECT ls.*, s.preset_name, s.force_fullscreen,
              s.block_screen_sharing, s.block_virtual_machine, s.disable_spell_check,
              s.enable_url_filter, s.allowed_url_patterns,
              f.file_name
       FROM launch_sessions ls
       LEFT JOIN seb_settings s ON s.course_id = ls.course_id AND s.quiz_id = ls.quiz_id
       LEFT JOIN seb_config_files f ON f.course_id = ls.course_id AND f.quiz_id = ls.quiz_id
       WHERE ls.launch_token = $1`,
      [launchToken]
    );
    const session = rows[0];

    if (!session) return res.status(404).send('Launch session not found.');
    if (session.used_at) return res.status(410).send('This launch link has already been used.');
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).send('This launch link has expired.');
    }

    const allowedDomains = Array.isArray(session.allowed_url_patterns)
      ? session.allowed_url_patterns
      : (session.allowed_url_patterns || []);

    const sebConfig = seb.generateConfig({
      courseId: session.course_id,
      quizId: session.quiz_id,
      launchToken,
      preset: session.preset_name || 'standard',
      allowedDomains,
      overrides: {
        browserViewMode: session.force_fullscreen ? 1 : 0,
        allowScreenSharing: !(session.block_screen_sharing ?? true),
        allowVirtualMachine: !(session.block_virtual_machine ?? true),
        allowSpellCheck: !(session.disable_spell_check ?? true),
        URLFilterEnable: session.enable_url_filter ?? true,
      },
    });

    const sebFile = seb.generateSEBFile(sebConfig);

    const baseName = (session.file_name || `quiz_${session.quiz_id}`)
      .replace(/\.seb$/i, '')
      .replace(/\s*\(Requires SEB\)\s*-?\s*SEB Configuration File/gi, '')
      .replace(/\s*\(Requires SEB\)/gi, '')
      .trim();
    const filename = `${baseName} (Requires SEB) - SEB Configuration File.seb`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(sebFile);

  } catch (err) {
    console.error('File stream error:', err);
    return res.status(500).send('Failed to stream exam file.');
  }
});


// ---------------------------------------------------------------------------
// GET /launch/:courseId/:quizId/download
// Renders a landing page that auto-triggers the .seb download and tells
// the student what's happening next.
// ---------------------------------------------------------------------------
router.get('/launch/:courseId/:quizId/download', async (req, res) => {
    const { courseId, quizId } = req.params;
    const canvasUserId = req.cookies?.canvas_user;

    if (!canvasUserId) {
        return res.status(401).send('You must be authenticated. Please click the exam link again.');
  }

  try {
      // Verify the student has a refresh token
      const user = await getUserByCanvasId(canvasUserId);
      if (!user?.refresh_token) {
          return res.redirect(`/launch/${courseId}/${quizId}`);
    }

    // Load the instructor's SEB configuration for this quiz
    const quizConfig = await getSEBConfigForStudent(courseId, quizId);
    if (!quizConfig) {
        return res.status(404).send('This exam has not been configured for SEB yet. Contact your instructor.');
    }
    if (!quizConfig.canvas_quiz_url) {
        return res.status(500).send('Exam is misconfigured (missing quiz URL). Contact your instructor.');
    }

    // Enforce the access (unlock) date BEFORE issuing a launch token.
    // Even though Canvas will block the actual quiz attempt before unlock_at,
    // we want to refuse here so students can't download a .seb early and
    // be confused by the failure later. Fail open (i.e. allow through) only
    // if Canvas itself errors — Canvas's own enforcement remains the backstop.
    try {
      const unlockAt = await fetchQuizUnlockAt(courseId, quizId);
      if (unlockAt && new Date(unlockAt) > new Date()) {
        const opensAt = new Date(unlockAt).toLocaleString('en-US', {
          dateStyle: 'long',
          timeStyle: 'short',
        });
        return res.status(403).send(`
          <html>
          <head><title>Exam Not Yet Available</title>
          <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96t.png">
          </head>
          <body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1a1a1a;">
            <div style="border:1px solid #e5e5e5;border-radius:12px;padding:32px;background:#fafafa;">
              <h2 style="margin-top:0;">This exam isn't open yet</h2>
              <p>Your instructor has scheduled this exam to open on:</p>
              <p style="font-size:18px;font-weight:600;color:#0021A5;">${opensAt}</p>
              <p style="color:#666;">Please return at or after that time and click the launch link again.</p>
            </div>
          </body>
          </html>
        `);
      }
    } catch (lookupErr) {
      // Canvas lookup failed — log and proceed. Canvas will still block the
      // attempt server-side if unlock_at hasn't passed.
      console.warn(`unlock_at check failed for course ${courseId} quiz ${quizId}:`, lookupErr.message);
    }

    // Generate launch token + register session now, so the download endpoint
    // just has to look it up and stream the file
    const launchToken = crypto.randomBytes(32).toString('hex');

    await createLaunchSession({
      launchToken,
      canvasUserId: Number(canvasUserId),
      courseId,
      quizId,
      canvasQuizURL: quizConfig.canvas_quiz_url,
      accessCode: quizConfig.access_code || null,
    });

    // Build and compute the Config Key NOW so we can store it on the session.
    // The /file endpoint will rebuild the same .seb deterministically.
    const presetName = quizConfig.preset_name || 'standard';
    const allowedDomains = Array.isArray(quizConfig.allowed_url_patterns)
    ? quizConfig.allowed_url_patterns
    : (quizConfig.allowed_url_patterns || []);

    const overrides = {
      browserViewMode: quizConfig.force_fullscreen ? 1 : 0,
      allowScreenSharing: !(quizConfig.block_screen_sharing ?? true),
      allowVirtualMachine: !(quizConfig.block_virtual_machine ?? true),
      allowSpellCheck: !(quizConfig.disable_spell_check ?? true),
      URLFilterEnable: quizConfig.enable_url_filter ?? true,
    };

    const sebConfig = seb.generateConfig({
        courseId,
        quizId,
        launchToken,
        preset: presetName,
        allowedDomains,
        overrides,
    });
    const configKey = seb.computeConfigKey(sebConfig);
    await updateLaunchSessionConfigKey(launchToken, configKey);

    // Render the landing page — it auto-downloads the file
    return res.send(renderLandingPage({ launchToken, courseId, quizId }));

} catch (err) {
    console.error('Download route error:', err);
    return res.status(500).send(
        `<html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;">
        <h2>Failed to prepare exam file</h2>
        <p><strong>Error:</strong> ${err.message}</p>
        </body></html>`
    );
}
});


// ---------------------------------------------------------------------------
// GET /launch/:courseId/:quizId
// Entry point when a student clicks the launch link from Canvas quiz page.
// Ensures we have a refresh token, then redirects to /download.
// ---------------------------------------------------------------------------
router.get('/launch/:courseId/:quizId', async (req, res) => {
  const { courseId, quizId } = req.params;

  // Always run OAuth. Canvas silently skips the consent screen for users
  // who've already authorized us, so this adds no UX friction for repeat
  // users — but it guarantees the token we use matches the Canvas user
  // currently logged in, not whoever last used this browser profile.
  const state = crypto.randomBytes(32).toString('hex');
  const returnTo = `/launch/${courseId}/${quizId}/download`;

  res.cookie('canvas_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  res.cookie('canvas_oauth_return_to', returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });

  const authURL = new URL(`${CANVAS_URL}/login/oauth2/auth`);
  authURL.searchParams.set('client_id', CLIENT_ID);
  authURL.searchParams.set('response_type', 'code');
  authURL.searchParams.set('redirect_uri', `${TOOL_URL}/oauth/callback`);
  authURL.searchParams.set('state', state);

  return res.redirect(authURL.toString());
});


// ---------------------------------------------------------------------------
// GET /oauth/callback
// Canvas redirects here after consent. Exchange the code for tokens,
// store them keyed by canvas_user_id, then redirect to the original
// destination stored in the cookie.
// ---------------------------------------------------------------------------
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error: errorParam } = req.query;

  // Canvas returned an error (e.g. user denied)
  if (errorParam) {
    // login_required means the user isn't logged into Canvas — prompt them to log in first
    if (errorParam === 'login_required' || errorParam === 'interaction_required') {
      return res.status(403).send(`
        <html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;">
          <div style="border:1px solid #e5e5e5;border-radius:12px;padding:32px;background:#fafafa;">
            <h2 style="margin-top:0;">Please log in to Canvas first</h2>
            <p>You need to be logged into Canvas before launching your exam.</p>
            <p><a href="${CANVAS_URL}/login" style="color:#0021A5;">Click here to log in to Canvas</a>, then return to your quiz and click the launch link again.</p>
          </div>
        </body></html>
      `);
    }

    return res.status(400).send(`
      <html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;">
        <h2>Authorization failed</h2>
        <p>${errorParam === 'access_denied'
          ? 'You declined authorization. Close this tab and click the launch link again to retry.'
          : `Canvas returned an error: ${errorParam}`}</p>
      </body></html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send('Missing code or state from Canvas.');
  }

  // Verify state matches the cookie
  const storedState = req.cookies?.canvas_oauth_state;
  if (!storedState || storedState !== state) {
    return res.status(403).send('OAuth state mismatch. Please try launching the exam again.');
  }

  const returnTo = req.cookies?.canvas_oauth_return_to || '/';

  // Exchange the code for tokens
  try {
    const tokenRes = await fetch(`${CANVAS_URL}/login/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${TOOL_URL}/oauth/callback`,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[OAuth] Token exchange failed:', tokenRes.status, errText);
      return res.status(500).send('Token exchange with Canvas failed. Please try again.');
    }

    const tokenData = await tokenRes.json();

    // Fetch the student's profile so we can store their name/email
    const profileRes = await fetch(`${CANVAS_URL}/api/v1/users/self/profile`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileRes.ok) {
        console.error('[OAuth] Profile fetch failed:', profileRes.status);

        // 401/403 here usually means the user isn't a real Canvas user —
        // most commonly "View as Student" (a test student account that can't
        // access OAuth endpoints). Detect and show a clearer message.
        if (profileRes.status === 401 || profileRes.status === 403) {
            return res.status(403).send(`
            <html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;">
                <div style="border:1px solid #e5e5e5;border-radius:12px;padding:32px;background:#fafafa;">
                <h2 style="margin-top:0;">Unable to launch exam</h2>
                <p>This exam can't be launched from a <strong>Student View</strong> session or a test account.</p>
                <p>If you're an instructor trying to preview the student experience, please log in with a real student account in a separate browser (or use a private/incognito window).</p>
                <p>If you are a student seeing this message, please log out of Canvas and log back in with your own account, then try the launch link again.</p>
                </div>
            </body></html>
            `);
        }

        return res.status(500).send('Failed to fetch Canvas profile. Please try again.');
    }
    const profile = await profileRes.json();

    // Upsert into users table
    await upsertUser({
      canvasUserId: profile.id,
      name: profile.name,
      email: profile.primary_email || null,
      avatarUrl: profile.avatar_url || null,
      canvasDomain: CANVAS_URL,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    });

    // Set the canvas_user cookie so future launches skip OAuth
    res.cookie('canvas_user', String(profile.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
    });

    // Clean up OAuth cookies
    res.clearCookie('canvas_oauth_state');
    res.clearCookie('canvas_oauth_return_to');

    console.log(`✅ OAuth completed for Canvas user ${profile.id} (${profile.name})`);

    // Redirect to the original destination
    return res.redirect(returnTo);
  } catch (err) {
    console.error('[OAuth] Unexpected error:', err);
    return res.status(500).send('An unexpected error occurred during authentication.');
  }
});


function renderLandingPage({ launchToken, courseId, quizId }) {
  const downloadUrl = `/launch/file/${launchToken}`;
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <title>Launch SEB Exam</title>
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96t.png">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; }
        .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 32px; background: #fafafa; }
        h1 { margin: 0 0 8px; font-size: 22px; }
        .subtitle { color: #666; margin: 0 0 28px; display: flex; align-items: center; }
        ol { line-height: 1.8; padding-left: 20px; }
        ol li { margin-bottom: 4px; }
        .highlight { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 20px 0; }
        .manual { margin-top: 24px; font-size: 14px; color: #666; }
        .manual a { color: #0021A5; text-decoration: none; }
        .manual a:hover { text-decoration: underline; }
        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #0021A5; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
        .checkmark { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #2a7a2a; border-radius: 50%; margin-right: 8px; color: white; font-size: 11px; font-weight: bold; }
        .status-done { color: #2a7a2a; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    </head>
    <body>
    <div class="card">
        <h1>Your exam is ready</h1>
        <p class="subtitle" id="status">
            <span class="spinner"></span>
            <span>Downloading your Safe Exam Browser configuration file…</span>
        </p>

        <div class="highlight">
        <strong>Next steps:</strong>
        <ol>
            <li>Wait for the <code>.seb</code> file to finish downloading.</li>
            <li>Open the downloaded file — Safe Exam Browser will launch automatically.</li>
            <li>Complete your exam inside Safe Exam Browser.</li>
        </ol>
        </div>

        <p class="manual">
        Download didn't start?
        <a href="${downloadUrl}">Click here to download manually</a>.
        </p>
    </div>

    <script>
        // Wait 2 seconds so students can read the page, then trigger the download
        // and swap the spinner for a checkmark.
        setTimeout(() => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = ${JSON.stringify(downloadUrl)};
            document.body.appendChild(iframe);

            const status = document.getElementById('status');
            status.classList.add('status-done');
            status.innerHTML =
                '<span class="checkmark">✓</span>' +
                '<span>Your exam file has been downloaded.</span>';
        }, 2000);
    </script>
    </body>
    </html>`;
}


module.exports = router;