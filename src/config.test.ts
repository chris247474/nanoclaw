describe('config', () => {
  // Since config.ts evaluates all exports at module load time,
  // we must reset modules and re-import for each test that needs
  // different environment variables.

  async function importConfig() {
    vi.resetModules();
    return await import('./config.js');
  }

  describe('ASSISTANT_NAME', () => {
    it('defaults to Andy when ASSISTANT_NAME env is unset', async () => {
      vi.stubEnv('ASSISTANT_NAME', '');

      const config = await importConfig();

      expect(config.ASSISTANT_NAME).toBe('Andy');
    });

    it('uses env var when ASSISTANT_NAME is set', async () => {
      vi.stubEnv('ASSISTANT_NAME', 'Jarvis');

      const config = await importConfig();

      expect(config.ASSISTANT_NAME).toBe('Jarvis');
    });
  });

  describe('TRIGGER_PATTERN', () => {
    it('matches @Andy at the start of a message (default name)', async () => {
      vi.stubEnv('ASSISTANT_NAME', '');

      const config = await importConfig();

      expect(config.TRIGGER_PATTERN.test('@Andy hello')).toBe(true);
    });

    it('matches case-insensitively', async () => {
      vi.stubEnv('ASSISTANT_NAME', '');

      const config = await importConfig();

      expect(config.TRIGGER_PATTERN.test('@andy Hello')).toBe(true);
      expect(config.TRIGGER_PATTERN.test('@ANDY Hello')).toBe(true);
    });

    it('does not match partial name due to word boundary', async () => {
      vi.stubEnv('ASSISTANT_NAME', '');

      const config = await importConfig();

      expect(config.TRIGGER_PATTERN.test('@Andrew hello')).toBe(false);
    });

    it('does not match when @name is not at the start', async () => {
      vi.stubEnv('ASSISTANT_NAME', '');

      const config = await importConfig();

      expect(config.TRIGGER_PATTERN.test('Hello @Andy')).toBe(false);
    });

    it('escapes regex special characters in custom name', async () => {
      vi.stubEnv('ASSISTANT_NAME', 'C++Bot');

      const config = await importConfig();

      // Should match the literal name with special chars
      expect(config.TRIGGER_PATTERN.test('@C++Bot do something')).toBe(true);
      // Should NOT match without the special chars (e.g., regex . or + meaning)
      expect(config.TRIGGER_PATTERN.test('@CxxBot do something')).toBe(false);
    });
  });

  describe('CONTAINER_TIMEOUT', () => {
    it('defaults to 300000 when env is unset', async () => {
      vi.stubEnv('CONTAINER_TIMEOUT', '');

      const config = await importConfig();

      expect(config.CONTAINER_TIMEOUT).toBe(300000);
    });

    it('parses CONTAINER_TIMEOUT from env var', async () => {
      vi.stubEnv('CONTAINER_TIMEOUT', '60000');

      const config = await importConfig();

      expect(config.CONTAINER_TIMEOUT).toBe(60000);
    });
  });

  describe('CONTAINER_IMAGE', () => {
    it('defaults to nanoclaw-agent:latest when env is unset', async () => {
      vi.stubEnv('CONTAINER_IMAGE', '');

      const config = await importConfig();

      expect(config.CONTAINER_IMAGE).toBe('nanoclaw-agent:latest');
    });
  });
});
