// SEB configuration generation and validation logic

const { createHash } = require('crypto');
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
 * @param {string} [options.quitPassword]    - Password to exit SEB (hashed)
 * @param {Object} [options.overrides]       - Manual overrides for any SEB setting
 * @returns {Object} Complete SEB configuration object
 */
function generateConfig(options) {
  const {
    startURL,
    preset = 'standard',
    allowedDomains = [],
    quitPassword = null,
    overrides = {},
  } = options;

  if (!startURL) {
    throw new Error('startURL is required');
  }

  // Start with the preset settings
  const presetConfig = SECURITY_PRESETS[preset];
  if (!presetConfig) {
    throw new Error(`Unknown preset: ${preset}. Available: ${Object.keys(SECURITY_PRESETS).join(', ')}`);
  }

  // Build the full configuration
  const config = {
    // Core settings
    startURL: startURL,
    startURLAllowDeepLink: true,

    // Apply preset
    ...presetConfig.settings,

    // Build URL filter rules
    URLFilterRules: buildURLFilterRules(allowedDomains),

    // Quit password (if provided)
    ...(quitPassword && {
      hashedQuitPassword: hashPassword(quitPassword),
    }),

    // Any manual overrides take precedence
    ...overrides,

    // Metadata
    originatorVersion: 'Canvas SEB LTI Tool 0.1.0',
  };

  return config;
}

// ---------------------------------------------------------------------------
// Build URL Filter Rules
// ---------------------------------------------------------------------------

function buildURLFilterRules(allowedDomains) {
  const rules = [];

  // Always allow the Canvas-related domains
  const defaultDomains = ['*.instructure.com/*'];

  const allDomains = [...defaultDomains, ...allowedDomains];

  allDomains.forEach((domain) => {
    rules.push({
      action: 1,       // 1 = allow
      active: true,
      expression: domain.includes('*') ? domain : `${domain}/*`,
      regex: false,
    });
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

  // plnd prefix = plain data (unencrypted, uncompressed)
  // Format: 4 bytes prefix + XML data
  const prefix = Buffer.from('plnd', 'utf8');
  return Buffer.concat([prefix, xmlBuffer]);
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
// Password Hashing (for quit password)
// ---------------------------------------------------------------------------

function hashPassword(password) {
  return createHash('sha256').update(password, 'utf8').digest('hex');
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
  hashPassword,
  sortAndClean,
  SECURITY_PRESETS,
};
