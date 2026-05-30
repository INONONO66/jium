#!/usr/bin/env node
/**
 * `pnpm dev` starts the currently runnable Jium surface:
 * ggui render MCP, API gateway MCP, user-context MCP, agent backend, and web app.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const WEB_URL = `http://localhost:${process.env.WEB_PORT ?? 6890}`;
const AGENT_PORT = 6791;
const POSIX = process.platform !== 'win32';
const VERBOSE =
  process.argv.slice(2).some((a) => a === '--verbose' || a === '-v') ||
  process.env.DEV_VERBOSE === '1';

const SERVICES = [
  { name: 'ggui', color: 34, script: 'dev:ggui', where: 'http://localhost:6781/mcp', note: 'UI render MCP' },
  { name: 'api', color: 35, script: 'dev:api-gateway', where: 'http://localhost:6783/mcp', note: 'API Fuse + Swing MCP' },
  { name: 'ctx', color: 33, script: 'dev:user-context', where: 'http://localhost:6784/mcp', note: 'user context MCP' },
  { name: 'agent', color: 32, script: 'dev:agent', where: `http://localhost:${AGENT_PORT}`, note: 'OpenAI Agents backend' },
  { name: 'web', color: 36, script: 'dev:web', where: WEB_URL, note: 'fullscreen app shell ←' },
];
const nameW = Math.max(...SERVICES.map((s) => s.name.length));
const whereW = Math.max(...SERVICES.map((s) => s.where.length));
const tag = (s) => `\x1b[${s.color}m[${s.name.padEnd(nameW)}]\x1b[0m`;
const table = SERVICES.map(
  (s) => `    \x1b[${s.color}m${s.name.padEnd(nameW)}\x1b[0m  ${s.where.padEnd(whereW)}  ${s.note}`,
).join('\n');

const logHint = VERBOSE
  ? `Streaming logs, labeled ${SERVICES.map(tag).join(' ')}.`
  : 'Logs are hidden — run \x1b[1mpnpm dev --verbose\x1b[0m to stream them.';

process.stdout.write(`
  Starting Jium — ${SERVICES.length} processes:

${table}

  \x1b[1mOpen ${WEB_URL}\x1b[0m once web is ready.
  ${logHint}

`);

const children = [];
const tails = new Map();
const TAIL_MAX = 40;
let shuttingDown = false;

function killTree(child, signal) {
  if (!child.pid) return;
  try {
    if (POSIX) process.kill(-child.pid, signal);
    else spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child, 'SIGTERM');
  setTimeout(() => {
    for (const child of children) killTree(child, 'SIGKILL');
    process.exit(code);
  }, 800).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

for (const s of SERVICES) {
  const child = spawn('pnpm', [s.script], { env: process.env, detached: POSIX });
  children.push(child);
  tails.set(s.name, []);
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      if (VERBOSE) {
        process.stdout.write(`${tag(s)} ${line}\n`);
      } else {
        const buf = tails.get(s.name);
        buf.push(line);
        if (buf.length > TAIL_MAX) buf.shift();
      }
    });
  }
  child.on('exit', (code) => {
    if (!shuttingDown && code) {
      process.stdout.write(`\n${tag(s)} exited (code ${code}) — stopping the others.\n`);
      if (!VERBOSE) {
        const buf = tails.get(s.name) ?? [];
        if (buf.length) {
          process.stdout.write(`${tag(s)} recent output:\n`);
          for (const l of buf) process.stdout.write(`  ${l}\n`);
        }
        process.stdout.write('(run `pnpm dev --verbose` to stream full logs)\n');
      }
      shutdown(code);
    }
  });
}

const DEADLINE = Date.now() + 90_000;
(async function openWhenReady() {
  while (!shuttingDown && Date.now() < DEADLINE) {
    try {
      const res = await fetch(WEB_URL);
      await res.body?.cancel?.();
    } catch {
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    process.stdout.write(`\n  \x1b[1;32m${WEB_URL} is ready.\x1b[0m\n\n`);
    return;
  }
})();
