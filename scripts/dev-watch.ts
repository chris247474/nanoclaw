#!/usr/bin/env tsx
/**
 * Development watcher for nanoclaw
 * Watches for file changes and automatically rebuilds/restarts the service
 */

import { spawn, exec } from 'child_process';
import { watch } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const CONTAINER_DIR = path.join(PROJECT_ROOT, 'container/agent-runner/src');
const LAUNCHD_PLIST = path.join(
  process.env.HOME || '~',
  'Library/LaunchAgents/com.nanoclaw.plist'
);

let isRebuilding = false;
let rebuildQueue: string[] = [];

async function buildMain(): Promise<boolean> {
  console.log('🔨 Building main project...');
  try {
    await execAsync('npm run build', { cwd: PROJECT_ROOT });
    console.log('✅ Main project built successfully');
    return true;
  } catch (err) {
    console.error('❌ Main build failed:', err);
    return false;
  }
}

async function buildContainer(): Promise<boolean> {
  console.log('🔨 Building container agent-runner...');
  try {
    await execAsync('npm run build', {
      cwd: path.join(PROJECT_ROOT, 'container/agent-runner')
    });
    console.log('✅ Container agent-runner built successfully');
    return true;
  } catch (err) {
    console.error('❌ Container build failed:', err);
    return false;
  }
}

async function rebuildContainerImage(): Promise<boolean> {
  console.log('🐳 Rebuilding container image...');
  try {
    const { stdout, stderr } = await execAsync(
      'container build -t nanoclaw-agent:latest .',
      { cwd: path.join(PROJECT_ROOT, 'container'), timeout: 300000 }
    );
    if (stderr) console.log(stderr);
    console.log('✅ Container image rebuilt successfully');
    return true;
  } catch (err) {
    console.error('❌ Container rebuild failed:', err);
    return false;
  }
}

async function restartService(): Promise<boolean> {
  console.log('🔄 Restarting nanoclaw service...');
  try {
    // Unload
    await execAsync(`launchctl unload ${LAUNCHD_PLIST}`).catch(() => {
      // Ignore error if service not loaded
    });

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Load
    await execAsync(`launchctl load ${LAUNCHD_PLIST}`);
    console.log('✅ Service restarted successfully');
    return true;
  } catch (err) {
    console.error('❌ Service restart failed:', err);
    return false;
  }
}

async function handleMainChange(filename: string): Promise<void> {
  if (isRebuilding) {
    rebuildQueue.push('main');
    return;
  }

  isRebuilding = true;
  console.log(`\n📝 Main source changed: ${filename}`);

  const success = await buildMain();
  if (success) {
    await restartService();
  }

  isRebuilding = false;

  // Process queue
  if (rebuildQueue.length > 0) {
    const next = rebuildQueue.shift();
    if (next === 'main') {
      setTimeout(() => handleMainChange('queued'), 100);
    } else if (next === 'container') {
      setTimeout(() => handleContainerChange('queued'), 100);
    }
  }
}

async function handleContainerChange(filename: string): Promise<void> {
  if (isRebuilding) {
    rebuildQueue.push('container');
    return;
  }

  isRebuilding = true;
  console.log(`\n📝 Container source changed: ${filename}`);

  const buildSuccess = await buildContainer();
  if (!buildSuccess) {
    isRebuilding = false;
    return;
  }

  const imageSuccess = await rebuildContainerImage();
  if (imageSuccess) {
    await restartService();
  }

  isRebuilding = false;

  // Process queue
  if (rebuildQueue.length > 0) {
    const next = rebuildQueue.shift();
    if (next === 'main') {
      setTimeout(() => handleMainChange('queued'), 100);
    } else if (next === 'container') {
      setTimeout(() => handleContainerChange('queued'), 100);
    }
  }
}

console.log('👀 Watching for changes...');
console.log(`   Main: ${SRC_DIR}`);
console.log(`   Container: ${CONTAINER_DIR}`);
console.log('');

// Watch main src directory
watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename || !filename.endsWith('.ts')) return;
  handleMainChange(filename);
});

// Watch container src directory
watch(CONTAINER_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename || !filename.endsWith('.ts')) return;
  handleContainerChange(filename);
});

// Keep process alive
process.stdin.resume();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Stopping watcher...');
  process.exit(0);
});
