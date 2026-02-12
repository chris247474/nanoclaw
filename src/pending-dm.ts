/**
 * Pending DM Request Management
 * Handles storage and lifecycle of DM registration requests awaiting admin approval
 */

import fs from 'fs';
import path from 'path';

import { DATA_DIR, MAIN_GROUP_FOLDER } from './config.js';
import { logger } from './logger.js';
import { PendingDmRequest } from './types.js';
import { loadJson, saveJson } from './utils.js';

const PENDING_FILE = path.join(DATA_DIR, 'pending_dm_requests.json');

export function loadPendingRequests(): PendingDmRequest[] {
  return loadJson<PendingDmRequest[]>(PENDING_FILE, []);
}

export function savePendingRequests(requests: PendingDmRequest[]): void {
  saveJson(PENDING_FILE, requests);
}

export function isPending(jid: string): boolean {
  return loadPendingRequests().some((r) => r.jid === jid);
}

export function addPendingRequest(request: PendingDmRequest): void {
  const requests = loadPendingRequests();
  if (requests.some((r) => r.jid === request.jid)) {
    logger.debug({ jid: request.jid }, 'DM request already pending');
    return;
  }
  requests.push(request);
  savePendingRequests(requests);
  writePendingForAdmin();
  logger.info(
    { jid: request.jid, phone: request.phone, senderName: request.senderName },
    'Pending DM request added',
  );
}

export function removePendingRequest(jid: string): PendingDmRequest | null {
  const requests = loadPendingRequests();
  const idx = requests.findIndex((r) => r.jid === jid);
  if (idx === -1) return null;
  const [removed] = requests.splice(idx, 1);
  savePendingRequests(requests);
  writePendingForAdmin();
  return removed;
}

/**
 * Write pending requests to the main group's IPC directory
 * so the admin agent has passive visibility.
 */
function writePendingForAdmin(): void {
  const adminIpcDir = path.join(DATA_DIR, 'ipc', MAIN_GROUP_FOLDER);
  fs.mkdirSync(adminIpcDir, { recursive: true });
  const pending = loadPendingRequests();
  fs.writeFileSync(
    path.join(adminIpcDir, 'pending_dm_requests.json'),
    JSON.stringify(pending, null, 2),
  );
}
