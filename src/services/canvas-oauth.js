// =============================================================================
// Canvas OAuth Helpers
// =============================================================================
// Wraps two Canvas endpoints used in the SEB student launch flow:
//   - POST /login/oauth2/token — exchange refresh_token → access_token
//   - GET  /login/session_token — exchange access_token → one-time session URL
// =============================================================================

const config = require('../config');
const { updateUserAccessToken } = require('../db/client');

const CANVAS_URL = config.platform.canvasUrl;
const CLIENT_ID = process.env.CANVAS_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CANVAS_OAUTH_CLIENT_SECRET;

/**
 * Exchange a stored refresh_token for a fresh short-lived access_token.
 * Updates the stored access_token in the users table as a side-effect.
 */
async function refreshAccessToken({ canvasUserId, refreshToken }) {
  const res = await fetch(`${CANVAS_URL}/login/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Canvas token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  await updateUserAccessToken(canvasUserId, data.access_token, data.expires_in);
  return data.access_token;
}

/**
 * Ask Canvas for a time-limited session URL. Hitting this URL in a browser
 * establishes a Canvas web session for the student (no login form) and
 * then redirects to `returnTo` if provided.
 */
async function getSessionURL({ accessToken, returnTo }) {
  const url = new URL(`${CANVAS_URL}/login/session_token`);
  if (returnTo) url.searchParams.set('return_to', returnTo);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Canvas session_token failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data.session_url) {
    throw new Error('Canvas session_token response missing session_url');
  }
  return data.session_url;
}

module.exports = { refreshAccessToken, getSessionURL };