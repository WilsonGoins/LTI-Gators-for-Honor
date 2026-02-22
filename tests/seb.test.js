// =============================================================================
// Tests for SEB Configuration Generator
// =============================================================================

const seb = require('../src/services/seb');

describe('SEB Configuration Generator', () => {
  // -------------------------------------------------------------------------
  // generateConfig
  // -------------------------------------------------------------------------

  describe('generateConfig', () => {
    it('should generate a config with standard preset', () => {
      const config = seb.generateConfig({
        startURL: 'http://canvas.test/courses/1/quizzes/1/take',
        preset: 'standard',
        allowedDomains: ['canvas.test'],
      });

      expect(config.startURL).toBe('http://canvas.test/courses/1/quizzes/1/take');
      expect(config.browserViewMode).toBe(1);
      expect(config.allowQuit).toBe(false);
      expect(config.allowScreenSharing).toBe(false);
      expect(config.enableJavaScript).toBe(true);
      expect(config.sendBrowserExamKey).toBe(true);
    });

    it('should throw if startURL is missing', () => {
      expect(() => seb.generateConfig({ preset: 'standard' })).toThrow('startURL is required');
    });

    it('should throw for unknown preset', () => {
      expect(() =>
        seb.generateConfig({ startURL: 'http://test.com', preset: 'nonexistent' })
      ).toThrow('Unknown preset');
    });

    it('should apply overrides on top of preset', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
        overrides: { allowSpellCheck: true },
      });

      // Standard preset sets allowSpellCheck to false, but override wins
      expect(config.allowSpellCheck).toBe(true);
    });

    it('should include quit password hash when provided', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
        quitPassword: 'secret123',
      });

      expect(config.hashedQuitPassword).toBeDefined();
      expect(config.hashedQuitPassword).toHaveLength(64); // SHA-256 hex
    });

    it('should build URL filter rules from allowed domains', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
        allowedDomains: ['canvas.ufl.edu', 'cdn.instructure.com'],
      });

      expect(config.URLFilterRules.length).toBeGreaterThanOrEqual(3);

      // Check that our custom domains are in the rules
      const expressions = config.URLFilterRules.map((r) => r.expression);
      expect(expressions).toContain('canvas.ufl.edu/*');
      expect(expressions).toContain('cdn.instructure.com/*');
      // Default instructure domain should always be present
      expect(expressions).toContain('*.instructure.com/*');
    });

    it('should generate different configs for different presets', () => {
      const standard = seb.generateConfig({ startURL: 'http://test.com', preset: 'standard' });
      const openBook = seb.generateConfig({ startURL: 'http://test.com', preset: 'openBook' });

      // Open book allows spell check, standard does not
      expect(standard.allowSpellCheck).toBe(false);
      expect(openBook.allowSpellCheck).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // configToXML
  // -------------------------------------------------------------------------

  describe('configToXML', () => {
    it('should produce valid XML plist', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
      });

      const xml = seb.configToXML(config);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<plist version="1.0">');
      expect(xml).toContain('<key>startURL</key>');
      expect(xml).toContain('<string>http://test.com</string>');
      expect(xml).toContain('</plist>');
    });
  });

  // -------------------------------------------------------------------------
  // generateSEBFile
  // -------------------------------------------------------------------------

  describe('generateSEBFile', () => {
    it('should produce a buffer starting with plnd prefix', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
      });

      const buffer = seb.generateSEBFile(config);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.slice(0, 4).toString('utf8')).toBe('plnd');
    });

    it('should contain valid XML after the prefix', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
      });

      const buffer = seb.generateSEBFile(config);
      const xmlPart = buffer.slice(4).toString('utf8');

      expect(xmlPart).toContain('<?xml version="1.0"');
      expect(xmlPart).toContain('startURL');
    });
  });

  // -------------------------------------------------------------------------
  // computeConfigKey
  // -------------------------------------------------------------------------

  describe('computeConfigKey', () => {
    it('should return a 64-character hex string', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
      });

      const key = seb.computeConfigKey(config);

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce the same key for the same config', () => {
      const config = seb.generateConfig({
        startURL: 'http://test.com',
        preset: 'standard',
        allowedDomains: ['canvas.test'],
      });

      const key1 = seb.computeConfigKey(config);
      const key2 = seb.computeConfigKey(config);

      expect(key1).toBe(key2);
    });

    it('should produce different keys for different configs', () => {
      const config1 = seb.generateConfig({ startURL: 'http://test1.com', preset: 'standard' });
      const config2 = seb.generateConfig({ startURL: 'http://test2.com', preset: 'standard' });

      expect(seb.computeConfigKey(config1)).not.toBe(seb.computeConfigKey(config2));
    });

    it('should not be affected by originatorVersion', () => {
      const config = seb.generateConfig({ startURL: 'http://test.com', preset: 'standard' });

      const key1 = seb.computeConfigKey(config);

      config.originatorVersion = 'Different Version 9.9';
      const key2 = seb.computeConfigKey(config);

      expect(key1).toBe(key2);
    });
  });

  // -------------------------------------------------------------------------
  // verifyConfigKeyHash
  // -------------------------------------------------------------------------

  describe('verifyConfigKeyHash', () => {
    it('should verify a correct hash', () => {
      const crypto = require('crypto');
      const configKey = 'abc123';
      const url = 'http://canvas.test/quiz/1';
      const hash = crypto.createHash('sha256').update(url + configKey, 'utf8').digest('hex');

      expect(seb.verifyConfigKeyHash(url, configKey, hash)).toBe(true);
    });

    it('should reject an incorrect hash', () => {
      expect(seb.verifyConfigKeyHash('http://test.com', 'key', 'badhash')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // sortAndClean
  // -------------------------------------------------------------------------

  describe('sortAndClean', () => {
    it('should sort keys case-insensitively', () => {
      const input = { Zebra: 1, alpha: 2, Beta: 3 };
      const sorted = seb.sortAndClean(input);
      const keys = Object.keys(sorted);

      expect(keys).toEqual(['alpha', 'Beta', 'Zebra']);
    });

    it('should remove empty dictionaries', () => {
      const input = { a: 1, b: {}, c: { nested: 'value' } };
      const cleaned = seb.sortAndClean(input);

      expect(cleaned.b).toBeUndefined();
      expect(cleaned.c).toEqual({ nested: 'value' });
    });

    it('should handle nested objects', () => {
      const input = { outer: { z: 1, a: 2 } };
      const sorted = seb.sortAndClean(input);

      expect(Object.keys(sorted.outer)).toEqual(['a', 'z']);
    });
  });

  // -------------------------------------------------------------------------
  // Security Presets
  // -------------------------------------------------------------------------

  describe('SECURITY_PRESETS', () => {
    it('should have all four expected presets', () => {
      expect(seb.SECURITY_PRESETS).toHaveProperty('standard');
      expect(seb.SECURITY_PRESETS).toHaveProperty('high');
      expect(seb.SECURITY_PRESETS).toHaveProperty('openBook');
      expect(seb.SECURITY_PRESETS).toHaveProperty('testingCenter');
    });

    it('each preset should have name, description, and settings', () => {
      Object.values(seb.SECURITY_PRESETS).forEach((preset) => {
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.settings).toBeDefined();
        expect(typeof preset.settings).toBe('object');
      });
    });
  });
});
