require('dotenv').config();

const config = {
  // Tool settings
  tool: {
    url: process.env.TOOL_URL || 'http://localhost:3001',
    port: Number.parseInt(process.env.TOOL_PORT, 10) || 3001,
  },

  // Canvas LTI Platform settings
  platform: {
    url: process.env.LTI_PLATFORM_URL,           // issuer URL (https://canvas.instructure.com)
    clientId: process.env.LTI_CLIENT_ID,
    canvasUrl: process.env.CANVAS_URL || 'http://localhost:3000',  // actual Canvas server
  },

  // Canvas REST API
  canvas: {
    apiUrl: process.env.CANVAS_API_URL,
    accessToken: process.env.CANVAS_ACCESS_TOKEN,
  },
};

module.exports = config;