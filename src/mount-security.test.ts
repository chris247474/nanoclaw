import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('fs');
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('./config.js', () => ({
  MOUNT_ALLOWLIST_PATH: '/mock/path/mount-allowlist.json',
}));

const VALID_ALLOWLIST = {
  allowedRoots: [
    {
      path: '~/projects',
      allowReadWrite: true,
      description: 'Development projects',
    },
  ],
  blockedPatterns: ['custom-blocked'],
  nonMainReadOnly: true,
};

describe('mount-security', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function importModule() {
    return await import('./mount-security.js');
  }

  function setupFsForValidAllowlist(
    fs: typeof import('fs'),
    allowlist: object = VALID_ALLOWLIST,
  ) {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(allowlist));
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);
  }

  // ---------------------------------------------------------------------------
  // loadMountAllowlist
  // ---------------------------------------------------------------------------
  describe('loadMountAllowlist', () => {
    it('returns null and caches error when allowlist file does not exist', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { loadMountAllowlist } = await importModule();

      // First call — file missing
      expect(loadMountAllowlist()).toBeNull();
      // Second call — cached, should not re-check fs
      expect(loadMountAllowlist()).toBeNull();
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });

    it('returns null when allowlist contains invalid JSON', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{{');

      const { loadMountAllowlist } = await importModule();

      expect(loadMountAllowlist()).toBeNull();
    });

    it('returns null when allowedRoots is not an array', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          allowedRoots: 'not-an-array',
          blockedPatterns: [],
          nonMainReadOnly: true,
        }),
      );

      const { loadMountAllowlist } = await importModule();

      expect(loadMountAllowlist()).toBeNull();
    });

    it('returns null when blockedPatterns is not an array', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          allowedRoots: [],
          blockedPatterns: 'not-an-array',
          nonMainReadOnly: true,
        }),
      );

      const { loadMountAllowlist } = await importModule();

      expect(loadMountAllowlist()).toBeNull();
    });

    it('returns null when nonMainReadOnly is not a boolean', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          allowedRoots: [],
          blockedPatterns: [],
          nonMainReadOnly: 'yes',
        }),
      );

      const { loadMountAllowlist } = await importModule();

      expect(loadMountAllowlist()).toBeNull();
    });

    it('returns valid allowlist with merged default blocked patterns', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { loadMountAllowlist } = await importModule();

      const result = loadMountAllowlist();

      expect(result).not.toBeNull();
      expect(result!.allowedRoots).toEqual(VALID_ALLOWLIST.allowedRoots);
      // Should contain the user-specified pattern
      expect(result!.blockedPatterns).toContain('custom-blocked');
      // Should contain default patterns merged in
      expect(result!.blockedPatterns).toContain('.ssh');
      expect(result!.blockedPatterns).toContain('.gnupg');
      expect(result!.blockedPatterns).toContain('.env');
      expect(result!.blockedPatterns).toContain('id_rsa');
      expect(result!.blockedPatterns).toContain('private_key');
      expect(result!.nonMainReadOnly).toBe(true);
    });

    it('caches result on second call and does not re-read file', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { loadMountAllowlist } = await importModule();

      const first = loadMountAllowlist();
      const second = loadMountAllowlist();

      expect(first).toBe(second); // Same reference — cached
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // validateMount
  // ---------------------------------------------------------------------------
  describe('validateMount', () => {
    it('rejects all mounts when no allowlist exists', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { validateMount } = await importModule();

      const result = validateMount(
        { hostPath: '/some/path', containerPath: 'data' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No mount allowlist configured');
    });

    it('rejects container path with ".." (path traversal)', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();

      const result = validateMount(
        { hostPath: '/some/path', containerPath: '../escape' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('..');
    });

    it('rejects absolute container path (starts with /)', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();

      const result = validateMount(
        { hostPath: '/some/path', containerPath: '/absolute/path' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid container path');
    });

    it('rejects empty container path', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();

      const result = validateMount(
        { hostPath: '/some/path', containerPath: '' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid container path');
    });

    it('rejects host path that does not exist on filesystem', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);
      // existsSync still returns true for the allowlist file,
      // but realpathSync throws for the host path
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        const pathStr = p as string;
        if (pathStr === '/mock/path/mount-allowlist.json') {
          return pathStr;
        }
        throw new Error('ENOENT');
      });

      const { validateMount } = await importModule();

      const result = validateMount(
        { hostPath: '/nonexistent/path', containerPath: 'data' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Host path does not exist');
    });

    it('rejects path matching blocked pattern ".ssh"', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();
      const homeDir = process.env.HOME || '/Users/user';

      const result = validateMount(
        { hostPath: `${homeDir}/.ssh/keys`, containerPath: 'keys' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.ssh');
    });

    it('rejects path matching blocked pattern ".env"', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();
      const homeDir = process.env.HOME || '/Users/user';

      const result = validateMount(
        {
          hostPath: `${homeDir}/projects/.env`,
          containerPath: 'env',
        },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.env');
    });

    it('rejects path not under any allowed root', async () => {
      const fs = await import('fs');
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();

      const result = validateMount(
        { hostPath: '/var/data/other', containerPath: 'data' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not under any allowed root');
    });

    it('allows path under an allowed root', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();

      const result = validateMount(
        {
          hostPath: `${homeDir}/projects/my-app`,
          containerPath: 'my-app',
          readonly: true,
        },
        true,
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Allowed under root');
      expect(result.realHostPath).toBe(`${homeDir}/projects/my-app`);
    });

    it('forces readonly for non-main group when nonMainReadOnly is true', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs);

      const { validateMount } = await importModule();

      const result = validateMount(
        {
          hostPath: `${homeDir}/projects/my-app`,
          containerPath: 'my-app',
          readonly: false, // Requesting read-write
        },
        false, // Non-main group
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(true); // Forced readonly
    });

    it('forces readonly when allowed root has allowReadWrite: false', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs, {
        allowedRoots: [
          {
            path: '~/projects',
            allowReadWrite: false, // Root disallows read-write
            description: 'Read-only projects',
          },
        ],
        blockedPatterns: [],
        nonMainReadOnly: false, // nonMainReadOnly is off
      });

      const { validateMount } = await importModule();

      const result = validateMount(
        {
          hostPath: `${homeDir}/projects/my-app`,
          containerPath: 'my-app',
          readonly: false, // Requesting read-write
        },
        true, // Main group
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(true); // Forced readonly by root config
    });

    it('allows read-write for main group when root allows it', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs, {
        allowedRoots: [
          {
            path: '~/projects',
            allowReadWrite: true,
          },
        ],
        blockedPatterns: [],
        nonMainReadOnly: false, // nonMainReadOnly is off
      });

      const { validateMount } = await importModule();

      const result = validateMount(
        {
          hostPath: `${homeDir}/projects/my-app`,
          containerPath: 'my-app',
          readonly: false, // Requesting read-write
        },
        true, // Main group
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(false); // Read-write granted
    });

    it('handles symlink resolution (realpathSync returns different path)', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs);

      // Symlink: ~/projects/link -> /actual/real/path
      // The real path must still be under an allowed root
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        const pathStr = p as string;
        if (pathStr === `${homeDir}/projects/link`) {
          return `${homeDir}/projects/real-target`;
        }
        return pathStr;
      });

      const { validateMount } = await importModule();

      const result = validateMount(
        {
          hostPath: `${homeDir}/projects/link`,
          containerPath: 'link',
          readonly: true,
        },
        true,
      );

      expect(result.allowed).toBe(true);
      expect(result.realHostPath).toBe(`${homeDir}/projects/real-target`);
    });
  });

  // ---------------------------------------------------------------------------
  // validateAdditionalMounts
  // ---------------------------------------------------------------------------
  describe('validateAdditionalMounts', () => {
    it('returns only validated mounts, filtering out rejected ones', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs);

      const { validateAdditionalMounts } = await importModule();

      const mounts = [
        {
          hostPath: `${homeDir}/projects/good`,
          containerPath: 'good',
          readonly: true,
        },
        {
          hostPath: '/not/allowed/path',
          containerPath: 'bad',
          readonly: true,
        },
        {
          hostPath: `${homeDir}/projects/also-good`,
          containerPath: 'also-good',
          readonly: true,
        },
      ];

      const result = validateAdditionalMounts(mounts, 'test-group', true);

      expect(result).toHaveLength(2);
      expect(result[0].hostPath).toBe(`${homeDir}/projects/good`);
      expect(result[1].hostPath).toBe(`${homeDir}/projects/also-good`);
    });

    it('prefixes container paths with /workspace/extra/', async () => {
      const fs = await import('fs');
      const homeDir = process.env.HOME || '/Users/user';
      setupFsForValidAllowlist(fs);

      const { validateAdditionalMounts } = await importModule();

      const mounts = [
        {
          hostPath: `${homeDir}/projects/my-app`,
          containerPath: 'my-app',
          readonly: true,
        },
      ];

      const result = validateAdditionalMounts(mounts, 'test-group', true);

      expect(result).toHaveLength(1);
      expect(result[0].containerPath).toBe('/workspace/extra/my-app');
    });

    it('returns empty array when all mounts are rejected', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false); // No allowlist

      const { validateAdditionalMounts } = await importModule();

      const mounts = [
        { hostPath: '/some/path', containerPath: 'data', readonly: true },
        { hostPath: '/another/path', containerPath: 'other', readonly: true },
      ];

      const result = validateAdditionalMounts(mounts, 'test-group', true);

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // generateAllowlistTemplate
  // ---------------------------------------------------------------------------
  describe('generateAllowlistTemplate', () => {
    it('returns valid JSON string', async () => {
      const { generateAllowlistTemplate } = await importModule();

      const template = generateAllowlistTemplate();

      expect(() => JSON.parse(template)).not.toThrow();
    });

    it('template contains allowedRoots, blockedPatterns, and nonMainReadOnly', async () => {
      const { generateAllowlistTemplate } = await importModule();

      const template = JSON.parse(generateAllowlistTemplate());

      expect(template).toHaveProperty('allowedRoots');
      expect(template).toHaveProperty('blockedPatterns');
      expect(template).toHaveProperty('nonMainReadOnly');
      expect(Array.isArray(template.allowedRoots)).toBe(true);
      expect(Array.isArray(template.blockedPatterns)).toBe(true);
      expect(typeof template.nonMainReadOnly).toBe('boolean');
    });
  });
});
