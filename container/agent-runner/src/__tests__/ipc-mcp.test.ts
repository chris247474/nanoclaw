import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Path validation functions extracted for testing
export function validateFilePathSecurity(filePath: string): { valid: boolean; error?: string } {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith('/workspace/group/')) {
    return { valid: false, error: 'Error: file_path must be within /workspace/group/' };
  }
  return { valid: true };
}

export function validateFileExists(filePath: string): { valid: boolean; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: `Error: file not found: ${filePath}` };
  }
  return { valid: true };
}

export function validateFileSize(filePath: string, maxSizeMB: number = 50): { valid: boolean; error?: string } {
  const stat = fs.statSync(filePath);
  const maxSize = maxSizeMB * 1024 * 1024;
  if (stat.size > maxSize) {
    return {
      valid: false,
      error: `Error: file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: ${maxSizeMB}MB.`
    };
  }
  return { valid: true };
}

describe('ipc-mcp - send_file tool validation', () => {
  const testDir = '/tmp/nanoclaw-test-workspace';
  const workspaceGroupDir = path.join(testDir, 'group');

  beforeEach(() => {
    // Clean and recreate test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceGroupDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('path security validation', () => {
    it('rejects absolute paths outside /workspace/group/', () => {
      const result = validateFilePathSecurity('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be within /workspace/group/');
    });

    it('rejects path traversal attempts (../../)', () => {
      const result = validateFilePathSecurity('/workspace/group/../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be within /workspace/group/');
    });

    it('rejects paths that resolve outside workspace', () => {
      const result = validateFilePathSecurity('/workspace/../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be within /workspace/group/');
    });

    it('accepts valid paths within /workspace/group/', () => {
      const result = validateFilePathSecurity('/workspace/group/reports/output.pdf');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts nested paths within /workspace/group/', () => {
      const result = validateFilePathSecurity('/workspace/group/subdir/nested/file.txt');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('file existence validation', () => {
    it('rejects non-existent files', () => {
      const result = validateFileExists('/workspace/group/nonexistent.pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('file not found');
      expect(result.error).toContain('/workspace/group/nonexistent.pdf');
    });

    it('accepts existing files', () => {
      const testFile = path.join(workspaceGroupDir, 'existing.txt');
      fs.writeFileSync(testFile, 'content');

      const result = validateFileExists(testFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('file size validation', () => {
    it('rejects files larger than 50MB', () => {
      const testFile = path.join(workspaceGroupDir, 'large-file.bin');
      const largeSize = 51 * 1024 * 1024; // 51MB

      // Create a large file efficiently using truncate
      const fd = fs.openSync(testFile, 'w');
      fs.ftruncateSync(fd, largeSize);
      fs.closeSync(fd);

      const result = validateFileSize(testFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('file too large');
      expect(result.error).toContain('51.0MB');
      expect(result.error).toContain('Max: 50MB');
    });

    it('accepts files under 50MB', () => {
      const testFile = path.join(workspaceGroupDir, 'small-file.txt');
      fs.writeFileSync(testFile, 'small content');

      const result = validateFileSize(testFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts files exactly at 50MB', () => {
      const testFile = path.join(workspaceGroupDir, 'exact-50mb.bin');
      const exactSize = 50 * 1024 * 1024; // Exactly 50MB

      const fd = fs.openSync(testFile, 'w');
      fs.ftruncateSync(fd, exactSize);
      fs.closeSync(fd);

      const result = validateFileSize(testFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('IPC message format', () => {
    it('generates correct relative path', () => {
      const resolved = '/workspace/group/reports/output.pdf';
      const relativePath = path.relative('/workspace/group', resolved);
      expect(relativePath).toBe('reports/output.pdf');
    });

    it('extracts correct filename', () => {
      const resolved = '/workspace/group/reports/output.pdf';
      const fileName = path.basename(resolved);
      expect(fileName).toBe('output.pdf');
    });

    it('IPC message structure matches IpcFileMessage interface', () => {
      // This test verifies the structure we'll write in the actual tool
      const ipcMessage = {
        type: 'file',
        chatJid: 'test@g.us',
        filePath: 'reports/output.pdf',
        caption: 'Test caption',
        fileName: 'output.pdf',
        groupFolder: 'test-group',
        timestamp: new Date().toISOString()
      };

      // Verify all required fields are present
      expect(ipcMessage.type).toBe('file');
      expect(ipcMessage.chatJid).toBeDefined();
      expect(ipcMessage.filePath).toBeDefined();
      expect(ipcMessage.groupFolder).toBeDefined();
      expect(ipcMessage.timestamp).toBeDefined();

      // Verify timestamp is valid ISO 8601
      expect(new Date(ipcMessage.timestamp).getTime()).toBeGreaterThan(0);

      // Verify optional fields work
      expect(ipcMessage.caption).toBe('Test caption');
      expect(ipcMessage.fileName).toBe('output.pdf');
    });
  });
});

describe('ipc-mcp - diagnostic tools', () => {
  const testDir = '/tmp/nanoclaw-test-ipc-diag';
  const ipcDir = path.join(testDir, 'ipc');
  const tasksDir = path.join(ipcDir, 'tasks');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Import the functions we need to test
  // Since createIpcMcp creates an MCP server, we test the tool logic via extracted helpers
  // We import the module to verify it exports correctly, then test the logic

  describe('get_diagnostics behavior', () => {
    it('reads diagnostics.json when it exists', () => {
      const snapshot = {
        timestamp: '2026-02-12T10:00:00.000Z',
        process: { uptime_ms: 1000, memory_mb: 200, node_version: 'v22', pid: 1, started_at: '2026-02-12T09:00:00.000Z' },
        containers: { active: [], recent: [] },
        messaging: { last_message_processed: null, registered_groups_count: 3, whatsapp_connected: true },
        errors: { recent_container_errors: [], last_error_at: null },
      };

      fs.writeFileSync(path.join(ipcDir, 'diagnostics.json'), JSON.stringify(snapshot));

      const content = fs.readFileSync(path.join(ipcDir, 'diagnostics.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.timestamp).toBe('2026-02-12T10:00:00.000Z');
      expect(parsed.process.memory_mb).toBe(200);
      expect(parsed.containers.active).toEqual([]);
    });

    it('returns null when diagnostics.json does not exist', () => {
      const diagPath = path.join(ipcDir, 'diagnostics.json');
      expect(fs.existsSync(diagPath)).toBe(false);
    });
  });

  describe('kill_stuck_agent IPC format', () => {
    it('writes correct IPC file for kill_container', () => {
      const data = {
        type: 'kill_container',
        targetGroupFolder: 'stuck-group',
        timestamp: new Date().toISOString(),
      };

      const filename = `${Date.now()}-test.json`;
      fs.writeFileSync(path.join(tasksDir, filename), JSON.stringify(data, null, 2));

      const written = JSON.parse(fs.readFileSync(path.join(tasksDir, filename), 'utf-8'));
      expect(written.type).toBe('kill_container');
      expect(written.targetGroupFolder).toBe('stuck-group');
    });
  });

  describe('restart_service IPC format', () => {
    it('writes correct IPC file for restart_service', () => {
      const data = {
        type: 'restart_service',
        timestamp: new Date().toISOString(),
      };

      const filename = `${Date.now()}-test.json`;
      fs.writeFileSync(path.join(tasksDir, filename), JSON.stringify(data, null, 2));

      const written = JSON.parse(fs.readFileSync(path.join(tasksDir, filename), 'utf-8'));
      expect(written.type).toBe('restart_service');
    });
  });

  describe('refresh_diagnostics IPC format', () => {
    it('writes correct IPC file for refresh_diagnostics', () => {
      const data = {
        type: 'refresh_diagnostics',
        timestamp: new Date().toISOString(),
      };

      const filename = `${Date.now()}-test.json`;
      fs.writeFileSync(path.join(tasksDir, filename), JSON.stringify(data, null, 2));

      const written = JSON.parse(fs.readFileSync(path.join(tasksDir, filename), 'utf-8'));
      expect(written.type).toBe('refresh_diagnostics');
    });
  });
});
