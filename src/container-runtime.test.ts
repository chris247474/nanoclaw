import { _resetRuntimeCache, detectRuntime } from './container-runtime.js';

beforeEach(() => {
  _resetRuntimeCache();
});

describe('detectRuntime', () => {
  describe('env var override', () => {
    it('uses docker when NANOCLAW_CONTAINER_RUNTIME=docker', () => {
      vi.stubEnv('NANOCLAW_CONTAINER_RUNTIME', 'docker');

      const runtime = detectRuntime();

      expect(runtime.name).toBe('docker');
      expect(runtime.command).toBe('docker');
    });

    it('uses apple-container when NANOCLAW_CONTAINER_RUNTIME=container', () => {
      vi.stubEnv('NANOCLAW_CONTAINER_RUNTIME', 'container');

      const runtime = detectRuntime();

      expect(runtime.name).toBe('apple-container');
      expect(runtime.command).toBe('container');
    });
  });

  it('caches the runtime after first detection', () => {
    vi.stubEnv('NANOCLAW_CONTAINER_RUNTIME', 'docker');

    const first = detectRuntime();
    // Change env — should still return cached
    vi.stubEnv('NANOCLAW_CONTAINER_RUNTIME', 'container');
    const second = detectRuntime();

    expect(first).toBe(second);
    expect(second.name).toBe('docker');
  });
});

describe('apple-container runtime', () => {
  beforeEach(() => {
    vi.stubEnv('NANOCLAW_CONTAINER_RUNTIME', 'container');
  });

  it('generates correct build command', () => {
    const runtime = detectRuntime();
    const cmd = runtime.buildCommand('/path/to/context', 'myimage:latest');

    expect(cmd).toEqual([
      'container',
      'build',
      '-t',
      'myimage:latest',
      '/path/to/context',
    ]);
  });

  it('generates correct run args with mounts', () => {
    const runtime = detectRuntime();
    const args = runtime.runArgs(
      [
        {
          hostPath: '/host/rw',
          containerPath: '/container/rw',
          readonly: false,
        },
        {
          hostPath: '/host/ro',
          containerPath: '/container/ro',
          readonly: true,
        },
      ],
      'myimage:latest',
    );

    expect(args).toEqual([
      'run',
      '-i',
      '--rm',
      '-v',
      '/host/rw:/container/rw',
      '--mount',
      'type=bind,source=/host/ro,target=/container/ro,readonly',
      'myimage:latest',
    ]);
  });

  it('generates correct check command', () => {
    const runtime = detectRuntime();
    expect(runtime.checkCommand()).toEqual(['container', 'system', 'status']);
  });
});

describe('docker runtime', () => {
  beforeEach(() => {
    vi.stubEnv('NANOCLAW_CONTAINER_RUNTIME', 'docker');
  });

  it('generates correct build command', () => {
    const runtime = detectRuntime();
    const cmd = runtime.buildCommand('/path/to/context', 'myimage:latest');

    expect(cmd).toEqual([
      'docker',
      'build',
      '-t',
      'myimage:latest',
      '/path/to/context',
    ]);
  });

  it('generates correct run args with mounts', () => {
    const runtime = detectRuntime();
    const args = runtime.runArgs(
      [
        {
          hostPath: '/host/rw',
          containerPath: '/container/rw',
          readonly: false,
        },
        {
          hostPath: '/host/ro',
          containerPath: '/container/ro',
          readonly: true,
        },
      ],
      'myimage:latest',
    );

    expect(args).toEqual([
      'run',
      '-i',
      '--rm',
      '-v',
      '/host/rw:/container/rw',
      '-v',
      '/host/ro:/container/ro:ro',
      'myimage:latest',
    ]);
  });

  it('generates correct check command', () => {
    const runtime = detectRuntime();
    expect(runtime.checkCommand()).toEqual(['docker', 'info']);
  });
});
