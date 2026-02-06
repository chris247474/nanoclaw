import { vi } from 'vitest';

// Mock fs before importing utils. In ESM, vi.mock is hoisted automatically.
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import fs from 'fs';
import { loadJson, saveJson } from './utils.js';

describe('loadJson', () => {
  it('returns parsed JSON when file exists and is valid', () => {
    const data = { key: 'value', count: 42 };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));

    const result = loadJson('/some/path.json', {});

    expect(fs.existsSync).toHaveBeenCalledWith('/some/path.json');
    expect(fs.readFileSync).toHaveBeenCalledWith('/some/path.json', 'utf-8');
    expect(result).toEqual(data);
  });

  it('returns default value when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const defaultValue = { fallback: true };
    const result = loadJson('/missing/path.json', defaultValue);

    expect(fs.existsSync).toHaveBeenCalledWith('/missing/path.json');
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(result).toEqual(defaultValue);
  });

  it('returns default value when file contains invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{{');

    const defaultValue = ['default'];
    const result = loadJson('/bad/file.json', defaultValue);

    expect(result).toEqual(defaultValue);
  });
});

describe('saveJson', () => {
  it('writes pretty-printed JSON to the specified path', () => {
    const data = { name: 'test', items: [1, 2, 3] };

    saveJson('/some/dir/file.json', data);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/some/dir/file.json',
      JSON.stringify(data, null, 2),
    );
  });

  it('creates parent directory recursively before writing', () => {
    const data = { ok: true };

    saveJson('/nested/deep/dir/file.json', data);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/nested/deep/dir', {
      recursive: true,
    });

    // Ensure mkdir is called before writeFile
    const mkdirOrder = vi.mocked(fs.mkdirSync).mock.invocationCallOrder[0];
    const writeOrder = vi.mocked(fs.writeFileSync).mock.invocationCallOrder[0];
    expect(mkdirOrder).toBeLessThan(writeOrder);
  });
});
