require('dotenv').config();

const config = {
  // Tool settings
  tool: {
    url: process.env.TOOL_URL || 'http://localhost:3001',
    port: parseInt(process.env.TOOL_PORT, 10) || 3001,
    ltiKey: process.env.LTI_KEY || 'DEVELOPMENT_KEY_CHANGE_ME',   // TODO
  },

  // Canvas LTI Platform settings (local Canvas instance)
  platform: {
    url: process.env.LTI_PLATFORM_URL,
    clientId: process.env.LTI_CLIENT_ID,
    authEndpoint: process.env.LTI_AUTHENTICATION_ENDPOINT,
    tokenEndpoint: process.env.LTI_ACCESS_TOKEN_ENDPOINT,
    keysetEndpoint: process.env.LTI_KEYSET_ENDPOINT,
  },

  // MongoDB for ltijs (localhost when running tool via npm, mongo when in Docker)
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/canvas-seb-lti',
  },

  // Canvas REST API (local Canvas instance)
  canvas: {
    apiUrl: process.env.CANVAS_API_URL,
    apiToken: process.env.CANVAS_API_TOKEN,
  },

  // SEB defaults
  seb: {
    defaultQuitPassword: process.env.SEB_DEFAULT_QUIT_PASSWORD || '',
    defaultAllowedDomain: process.env.SEB_DEFAULT_ALLOWED_DOMAIN || '',
  },
};

module.exports = config;