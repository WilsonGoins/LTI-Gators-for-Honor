// SEB configuration generation and validation logic

const { createHash } = require('crypto');
const zlib = require('zlib');
const { build } = require('plist');

// Security Presets which map to the setup wizard's dropdown

const SECURITY_PRESETS = {
  standard: {
    name: 'Standard Proctored',
    description: 'Lockdown browser, fullscreen, no screen sharing',
    settings: {
      browserViewMode: 1,           // Fullscreen
      allowQuit: false,
      allowSpellCheck: false,
      allowDictionaryLookup: false,
      allowScreenSharing: false,
      allowVideoCapture: false,
      allowAudioCapture: false,
      allowVirtualMachine: false,
      URLFilterEnable: true,
      enableJavaScript: true,
      enablePlugIns: false,
      allowDownUploads: false,
      allowPDFPlugIn: false,
      sendBrowserExamKey: true,
    },
  },

  high: {
    name: 'High Security',
    description: 'All restrictions enabled, VM blocking, clipboard disabled',
    settings: {
      browserViewMode: 1,
      allowQuit: false,
      allowSpellCheck: false,
      allowDictionaryLookup: false,
      allowScreenSharing: false,
      allowVideoCapture: false,
      allowAudioCapture: false,
      allowVirtualMachine: false,
      allowClipboardAccess: false,
      URLFilterEnable: true,
      enableJavaScript: true,
      enablePlugIns: false,
      allowDownUploads: false,
      allowPDFPlugIn: false,
      allowPrinting: false,
      sendBrowserExamKey: true,
      prohibitedProcesses: getDefaultProhibitedProcesses(),
    },
  },

  openBook: {
    name: 'Open Book',
    description: 'Basic lockdown, allows specified reference URLs',
    settings: {
      browserViewMode: 1,
      allowQuit: false,
      allowSpellCheck: true,
      allowDictionaryLookup: true,
      allowScreenSharing: false,
      allowVideoCapture: false,
      allowAudioCapture: false,
      allowVirtualMachine: false,
      URLFilterEnable: true,
      enableJavaScript: true,
      enablePlugIns: false,
      allowDownUploads: false,
      allowPDFPlugIn: true,
      sendBrowserExamKey: true,
    },
  },

  testingCenter: {
    name: 'Testing Center',
    description: 'Controlled environment with proctor password',
    settings: {
      browserViewMode: 1,
      allowQuit: true,              // Proctors can quit with password
      allowSpellCheck: false,
      allowDictionaryLookup: false,
      allowScreenSharing: false,
      allowVideoCapture: false,
      allowAudioCapture: false,
      allowVirtualMachine: false,
      URLFilterEnable: true,
      enableJavaScript: true,
      enablePlugIns: false,
      allowDownUploads: false,
      allowPDFPlugIn: false,
      sendBrowserExamKey: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Default list of prohibited processes (messaging/sharing apps)
// ---------------------------------------------------------------------------

function getDefaultProhibitedProcesses() {
  return [
    { active: true, os: 1, executable: 'zoom.exe', description: 'Zoom' },
    { active: true, os: 1, executable: 'Discord.exe', description: 'Discord' },
    { active: true, os: 1, executable: 'Slack.exe', description: 'Slack' },
    { active: true, os: 1, executable: 'Teams.exe', description: 'Microsoft Teams' },
    { active: true, os: 1, executable: 'Telegram.exe', description: 'Telegram' },
    { active: true, os: 1, executable: 'WhatsApp.exe', description: 'WhatsApp' },
  ];
}

// ---------------------------------------------------------------------------
// Generate SEB Configuration
// ---------------------------------------------------------------------------

/**
 * Generate a complete SEB configuration object.
 *
 * @param {Object} options
 * @param {string} options.startURL          - The Canvas quiz URL
 * @param {string} options.preset            - Security preset name (standard|high|openBook|testingCenter)
 * @param {string[]} options.allowedDomains  - Domains to whitelist in URL filter
 * @param {string} [options.quitPassword]    - Password to exit SEB
 * @param {Object} [options.overrides]       - Manual overrides for any SEB setting
 * @returns {Object} Complete SEB configuration object
 */
function generateConfig(options) {
  const {
    canvasQuizURL,                                
    gateBaseURL = process.env.GATE_BASE_URL,
    courseId,
    quizId,
    preset = 'standard',
    allowedDomains = [],
    quitPassword = null,
    overrides = {},
  } = options;

  if (!canvasQuizURL || !gateBaseURL || !courseId || !quizId) {
    throw new Error('canvasQuizURL, gateBaseURL, courseId, and quizId are required');
  }

  const presetConfig = SECURITY_PRESETS[preset];
  if (!presetConfig) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  // startURL is the Canvas quiz OVERVIEW page (strip /take if present).
  // Canvas handles login via its native redirect flow, then student clicks
  // "Begin Secure Exam" which routes back through our gate for access_code.
  const overviewURL = canvasQuizURL.replace(/\/take\/?$/, '');
  const startURL = overviewURL;

  // Build allowed-domains list: gate + canvas host (both need to be reachable)
  let gateDomain, canvasDomain;
  try { gateDomain = new URL(gateBaseURL).host; } catch {}
  try { canvasDomain = new URL(canvasQuizURL).host; } catch {}
  const allDomains = [...allowedDomains];
  if (gateDomain && !allDomains.includes(gateDomain)) allDomains.push(gateDomain);
  if (canvasDomain && !allDomains.includes(canvasDomain)) allDomains.push(canvasDomain);

  const config = {
  startURL,
  startURLAllowDeepLink: true,
  // Force link clicks to open in the same window. External-domain links
  // (like Begin Secure Exam button) open as NEW windows by default,
  // which don't carry the ConfigKeyHash session and break the gate.
  newBrowserWindowByLinkPolicy: 1,  // 0=block, 1=same window, 2=new window
  newBrowserWindowByScriptPolicy: 1, // same for window.open() calls
  ...presetConfig.settings,
  URLFilterRules: buildURLFilterRules(allDomains),
  ...(quitPassword &&
     { hashedQuitPassword: createHash('sha256').update(quitPassword, 'utf8').digest('hex') }),
  ...overrides,
  originatorVersion: 'Gators for Honor LTI 0.1.0',
};

  return config;
}

// ---------------------------------------------------------------------------
// Build URL Filter Rules
// ---------------------------------------------------------------------------

function buildURLFilterRules(allowedDomains) {
  const rules = [];
  const defaultDomains = ['*.instructure.com/*'];
  const allDomains = [...defaultDomains, ...allowedDomains];

  allDomains.forEach((domain) => {
    if (domain.includes('://')) {
      // Already a full URL pattern
      rules.push({
        action: 1, active: true, regex: false,
        expression: domain.endsWith('/*') ? domain : `${domain}/*`,
      });
    } else if (domain.includes('*')) {
      // Wildcard pattern like *.instructure.com/*
      rules.push({
        action: 1, active: true, regex: false,
        expression: domain.endsWith('/*') ? domain : `${domain}/*`,
      });
    } else {
      // Plain host or host:port — emit explicit http:// and https:// rules.
      // SEB's filter parser can misread "host:port/*" as scheme:opaque.
      rules.push({
        action: 1, active: true, regex: false,
        expression: `http://${domain}/*`,
      });
      rules.push({
        action: 1, active: true, regex: false,
        expression: `https://${domain}/*`,
      });
    }
  });

  return rules;
}

// ---------------------------------------------------------------------------
// Convert Config to XML Plist
// ---------------------------------------------------------------------------

/**
 * Convert a config object to XML plist string (the core of a .seb file).
 *
 * @param {Object} config - SEB configuration object
 * @returns {string} XML plist string
 */
function configToXML(config) {
  return build(config);
}

// ---------------------------------------------------------------------------
// Generate .seb File Buffer
// ---------------------------------------------------------------------------

/**
 * Generate a .seb file as a Buffer.
 * For MVP, generates an unencrypted (plnd prefix) file.
 *
 * @param {Object} config - SEB configuration object
 * @returns {Buffer} .seb file contents ready to write/send
 */
function generateSEBFile(config) {
  const xml = configToXML(config);
  const xmlBuffer = Buffer.from(xml, 'utf8');

  // SEB file format: plnd prefix + gzip-compressed XML plist
  // Reference: https://safeexambrowser.org/developer/seb-file-format.html
  const compressed = zlib.gzipSync(xmlBuffer);
  const prefix = Buffer.from('plnd', 'utf8');
  return Buffer.concat([prefix, compressed]);
}

// ---------------------------------------------------------------------------
// Config Key Computation
// ---------------------------------------------------------------------------

/**
 * Compute the SEB Config Key from a configuration object.
 * Algorithm:
 *   1. Remove originatorVersion
 *   2. Sort all keys alphabetically (case-insensitive, recursive)
 *   3. Remove empty dictionaries
 *   4. Convert to JSON (no whitespace)
 *   5. SHA-256 hash → lowercase hex
 *
 * Reference: https://safeexambrowser.org/developer/seb-config-key.html
 *
 * @param {Object} config - SEB configuration object
 * @returns {string} 64-character hex string (Config Key)
 */
function computeConfigKey(config) {
  // Deep clone to avoid mutating the original
  const cleaned = JSON.parse(JSON.stringify(config));

  // Step 1: Remove originatorVersion
  delete cleaned.originatorVersion;

  // Step 2 & 3: Sort keys and remove empty dicts
  const sorted = sortAndClean(cleaned);

  // Step 4: Convert to JSON (no whitespace)
  const json = JSON.stringify(sorted);

  // Step 5: SHA-256 hash
  const hash = createHash('sha256').update(json, 'utf8').digest('hex');

  return hash;
}

/**
 * Recursively sort object keys (case-insensitive) and remove empty dicts.
 */
function sortAndClean(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortAndClean);
  }

  if (obj !== null && typeof obj === 'object') {
    const sorted = {};
    const keys = Object.keys(obj).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    for (const key of keys) {
      const value = sortAndClean(obj[key]);

      // Remove empty dictionaries
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        if (Object.keys(value).length === 0) continue;
      }

      sorted[key] = value;
    }

    return sorted;
  }

  return obj;
}

/**
 * Verify a Config Key hash against a request URL.
 * Canvas sends: X-SafeExamBrowser-ConfigKeyHash = SHA256(requestURL + configKey)
 *
 * @param {string} requestURL - The URL being accessed
 * @param {string} configKey - The Config Key of the SEB configuration
 * @param {string} receivedHash - The hash from the request header
 * @returns {boolean} Whether the hash is valid
 */
function verifyConfigKeyHash(requestURL, configKey, receivedHash) {
  const expected = createHash('sha256')
    .update(requestURL + configKey, 'utf8')
    .digest('hex');
  return expected === receivedHash;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateConfig,
  configToXML,
  generateSEBFile,
  computeConfigKey,
  verifyConfigKeyHash,
  sortAndClean,
  SECURITY_PRESETS,
};