import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { validateSessionId } from '../container-runner.js';

describe('validateSessionId', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-session-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when sessionId is undefined', () => {
    expect(validateSessionId(undefined, 'some-group', tmpDir)).toBeUndefined();
  });

  it('returns undefined when sessionId is empty string', () => {
    expect(validateSessionId('', 'some-group', tmpDir)).toBeUndefined();
  });

  it('returns sessionId when transcript .jsonl file exists on disk', () => {
    const sessionId = 'abc123-def456';
    const folder = 'test-group';
    const transcriptDir = path.join(tmpDir, 'sessions', folder, '.claude', 'projects', '-workspace-group');
    fs.mkdirSync(transcriptDir, { recursive: true });
    fs.writeFileSync(path.join(transcriptDir, `${sessionId}.jsonl`), '{"type":"test"}');

    expect(validateSessionId(sessionId, folder, tmpDir)).toBe(sessionId);
  });

  it('returns undefined when transcript file is missing (stale session)', () => {
    const sessionId = 'stale-session-id';
    const folder = 'test-group';
    // Create the projects directory but NOT the transcript file
    const transcriptDir = path.join(tmpDir, 'sessions', folder, '.claude', 'projects', '-workspace-group');
    fs.mkdirSync(transcriptDir, { recursive: true });

    expect(validateSessionId(sessionId, folder, tmpDir)).toBeUndefined();
  });

  it('returns undefined when projects/ directory does not exist', () => {
    const sessionId = 'no-projects-dir';
    const folder = 'test-group';
    // Create .claude but not projects/
    const claudeDir = path.join(tmpDir, 'sessions', folder, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    expect(validateSessionId(sessionId, folder, tmpDir)).toBeUndefined();
  });

  it('returns undefined when session dir itself does not exist', () => {
    const sessionId = 'no-session-dir';
    const folder = 'nonexistent-group';

    expect(validateSessionId(sessionId, folder, tmpDir)).toBeUndefined();
  });

  it('logs a warning when detecting a stale session', () => {
    const sessionId = 'stale-session';
    const folder = 'stale-group';
    // Session dir exists but no transcript
    const claudeDir = path.join(tmpDir, 'sessions', folder, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    // The function should still return undefined (stale)
    const result = validateSessionId(sessionId, folder, tmpDir);
    expect(result).toBeUndefined();
  });
});
