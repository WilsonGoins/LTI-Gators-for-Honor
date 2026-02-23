// LTI info/debug routes (development only)

const express = require('express');
const router = express.Router();
const config = require('../config');

router.get('/setup', (req, res) => {
  const toolUrl = config.tool.url;

  res.json({
    tool_url: toolUrl,
    jwks_url: `${toolUrl}/keys`,
    login_url: `${toolUrl}/lti/login`,
    launch_url: `${toolUrl}/lti/launch`,
    platform_url: config.platform.url || 'not configured',
    client_id: config.platform.clientId || 'not configured',
    canvas_url: config.platform.canvasUrl || 'not configured',
  });
});

module.exports = router;