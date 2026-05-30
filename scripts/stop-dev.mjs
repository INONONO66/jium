#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

// ggui, api-gateway, user-context, future audio, agent/sandbox proxy, web.
const PORTS = [6781, 6783, 6784, 6785, 6791, 7791, 6890];
let freed = 0;

for (const port of PORTS) {
  let listed;
  try {
    listed = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error('lsof not found — stop the servers manually.');
      process.exit(1);
    }
    continue;
  }
  for (const pid of listed.split('\n').map((s) => s.trim()).filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGKILL');
      console.log(`  freed :${port} (pid ${pid})`);
      freed++;
    } catch {
      /* already gone */
    }
  }
}

console.log(freed ? `\n✓ freed ${freed} stale process(es).` : '✓ no stale dev processes found.');
