import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock container-runner tracking functions
vi.mock('../container-runner.js', () => ({
  getActiveContainers: vi.fn(() => []),
  getRecentRuns: vi.fn(() => []),
  getRecentErrors: vi.fn(() => []),
}));

import { writeDiagnosticsSnapshot, DiagnosticsContext } from '../diagnostics.js';
import { getActiveContainers, getRecentRuns, getRecentErrors } from '../container-runner.js';
import type { ActiveContainer, RecentContainerRun, ContainerErrorSummary } from '../types.js';

describe('writeDiagnosticsSnapshot', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-diag-'));
    vi.mocked(getActiveContainers).mockReturnValue([]);
    vi.mocked(getRecentRuns).mockReturnValue([]);
    vi.mocked(getRecentErrors).mockReturnValue([]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const defaultContext: DiagnosticsContext = {
    lastMessageProcessed: '2026-02-12T10:00:00.000Z',
    registeredGroupsCount: 5,
    whatsappConnected: true,
  };

  it('writes valid JSON to the correct path', () => {
    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.timestamp).toBeTruthy();
  });

  it('includes process info', () => {
    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.process.uptime_ms).toBeGreaterThan(0);
    expect(data.process.memory_mb).toBeGreaterThan(0);
    expect(data.process.node_version).toBe(process.version);
    expect(data.process.pid).toBe(process.pid);
    expect(data.process.started_at).toBeTruthy();
  });

  it('includes messaging context', () => {
    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.messaging).toEqual({
      last_message_processed: '2026-02-12T10:00:00.000Z',
      registered_groups_count: 5,
      whatsapp_connected: true,
    });
  });

  it('includes active containers from tracking', () => {
    const mockActive: ActiveContainer[] = [
      {
        groupFolder: 'family',
        groupName: 'Family Chat',
        pid: 1234,
        startedAt: '2026-02-12T10:00:00.000Z',
        elapsedMs: 30000,
        promptPreview: 'What is the weather?',
      },
    ];
    vi.mocked(getActiveContainers).mockReturnValue(mockActive);

    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.containers.active).toEqual(mockActive);
  });

  it('includes recent runs from tracking', () => {
    const mockRuns: RecentContainerRun[] = [
      {
        groupFolder: 'family',
        groupName: 'Family Chat',
        startedAt: '2026-02-12T09:55:00.000Z',
        durationMs: 5000,
        status: 'success',
      },
    ];
    vi.mocked(getRecentRuns).mockReturnValue(mockRuns);

    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.containers.recent).toEqual(mockRuns);
  });

  it('includes recent errors and last_error_at', () => {
    const mockErrors: ContainerErrorSummary[] = [
      {
        groupFolder: 'buggy',
        timestamp: '2026-02-12T09:50:00.000Z',
        error: 'Container exited with code 1',
        type: 'exit_code',
      },
    ];
    vi.mocked(getRecentErrors).mockReturnValue(mockErrors);

    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.errors.recent_container_errors).toEqual(mockErrors);
    expect(data.errors.last_error_at).toBe('2026-02-12T09:50:00.000Z');
  });

  it('sets last_error_at to null when no errors', () => {
    writeDiagnosticsSnapshot('test-group', defaultContext, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.errors.last_error_at).toBeNull();
  });

  it('handles null lastMessageProcessed', () => {
    writeDiagnosticsSnapshot('test-group', {
      ...defaultContext,
      lastMessageProcessed: null,
    }, tmpDir);

    const filePath = path.join(tmpDir, 'ipc', 'test-group', 'diagnostics.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data.messaging.last_message_processed).toBeNull();
  });

  it('creates IPC directory if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'deep', 'nested');
    // Pass a dataDir that doesn't have the ipc subdir yet
    writeDiagnosticsSnapshot('new-group', defaultContext, nestedDir);

    const filePath = path.join(nestedDir, 'ipc', 'new-group', 'diagnostics.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
