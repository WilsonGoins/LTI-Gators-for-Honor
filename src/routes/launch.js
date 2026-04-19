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
const { getUserByCanvasId, upsertUser } = require('../db/client');

const CANVAS_URL = config.platform.canvasUrl;
const CLIENT_ID = process.env.CANVAS_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CANVAS_OAUTH_CLIENT_SECRET;
const TOOL_URL = config.tool.url;

// ---------------------------------------------------------------------------
// GET /launch/:quizId
// Entry point when a student clicks the launch link from Canvas quiz page.
// Checks if we have a refresh token; if not, starts the Canvas OAuth flow.
// ---------------------------------------------------------------------------

router.get('/launch/:quizId', async (req, res) => {
  const { quizId } = req.params;

  // 1. Do we already know who this student is?
  const canvasUserId = req.cookies?.canvas_user;

  if (canvasUserId) {
    try {
      const user = await getUserByCanvasId(canvasUserId);
      if (user?.refresh_token) {
        // Already consented — skip OAuth and go to .seb download
        return res.redirect(`/launch/${quizId}/download`);
      }
    } catch (err) {
      console.error('Launch DB error:', err);
      // Fall through to OAuth flow
    }
  }

  // 2. No consent yet — start Canvas OAuth flow
  const state = crypto.randomBytes(32).toString('hex');
  const returnTo = `/launch/${quizId}/download`;

  // Stash state + return_to in cookies so /oauth/callback can verify them
  res.cookie('canvas_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,  // 10 minutes
  });
  res.cookie('canvas_oauth_return_to', returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });

  // Build the Canvas OAuth URL and redirect
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

module.exports = router;