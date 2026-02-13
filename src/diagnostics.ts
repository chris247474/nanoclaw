import fs from 'fs';
import path from 'path';

import { getActiveContainers, getRecentRuns, getRecentErrors } from './container-runner.js';
import type { DiagnosticsSnapshot } from './types.js';

const processStartedAt = new Date().toISOString();

export interface DiagnosticsContext {
  lastMessageProcessed: string | null;
  registeredGroupsCount: number;
  whatsappConnected: boolean;
}

export function writeDiagnosticsSnapshot(
  groupFolder: string,
  context: DiagnosticsContext,
  dataDir: string,
): void {
  const errors = getRecentErrors();

  const snapshot: DiagnosticsSnapshot = {
    timestamp: new Date().toISOString(),
    process: {
      uptime_ms: Math.round(process.uptime() * 1000),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node_version: process.version,
      pid: process.pid,
      started_at: processStartedAt,
    },
    containers: {
      active: getActiveContainers(),
      recent: getRecentRuns(),
    },
    messaging: {
      last_message_processed: context.lastMessageProcessed,
      registered_groups_count: context.registeredGroupsCount,
      whatsapp_connected: context.whatsappConnected,
    },
    errors: {
      recent_container_errors: errors,
      last_error_at: errors.length > 0 ? errors[errors.length - 1].timestamp : null,
    },
  };

  const groupIpcDir = path.join(dataDir, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });
  fs.writeFileSync(
    path.join(groupIpcDir, 'diagnostics.json'),
    JSON.stringify(snapshot, null, 2),
  );
}
