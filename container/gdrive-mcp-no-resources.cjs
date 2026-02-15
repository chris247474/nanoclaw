#!/usr/bin/env node
/**
 * Proxy wrapper for google-drive-mcp that strips the 'resources' capability.
 *
 * google-drive-mcp exposes Drive files as MCP resources. During init, Claude
 * Code calls resources/list, which times out (~60s) in Apple Container VMs
 * and triggers SessionEnd. This proxy intercepts the initialize response and
 * removes the resources capability so Claude never requests them.
 *
 * All tool calls pass through unmodified.
 * MCP stdio uses newline-delimited JSON-RPC (no embedded newlines per spec).
 */
const { spawn } = require('child_process');

const child = spawn('google-drive-mcp', [], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});

process.stdin.pipe(child.stdin);

let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.result?.capabilities?.resources !== undefined) {
        delete msg.result.capabilities.resources;
      }
      process.stdout.write(JSON.stringify(msg) + '\n');
    } catch {
      process.stdout.write(line + '\n');
    }
  }
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
