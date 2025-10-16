import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from './lib/paths.mjs';
import { writePidFile, readPid, killPid } from './lib/process-utils.mjs';

const MODE = process.argv[2] || 'start';
const PORT = Number(process.env.W2A_DEV_PORT || 5173);
const PID_PATH = path.join(OUT_DIR, 'pids', 'web-dev.pid');

function start() {
  if (fs.existsSync(PID_PATH)) {
    console.error('Dev server appears to be running (pid file exists). Use stop first.');
    process.exit(2);
  }
  // Spawn a detached child that runs the Vite dev server via pnpm workspace filter
  const child = spawn(process.execPath, [
    '-e',
    // inline node program: spawn pnpm dev with args; keep stdio detached
    `const {spawn}=require('child_process');
     const ch=spawn('pnpm', ['-w','--filter','@wav2amiga/web','dev','--','--port','${PORT}','--host'], {
       stdio: 'ignore', shell: process.platform==='win32', detached: true
     });
     ch.unref();
    `
  ], { stdio: 'ignore', detached: true });
  // The immediate child's pid is fine to track; it exits after spawning pnpm child in detached mode.
  writePidFile(PID_PATH, child.pid);
  child.unref();
  console.log(`Dev server starting on http://localhost:${PORT} (pidfile: ${PID_PATH})`);
}

async function stop() {
  const pid = readPid(PID_PATH);
  if (!pid) { console.log('No dev server pid found.'); return; }
  try { await killPid(pid); } finally { try { fs.unlinkSync(PID_PATH); } catch {} }
  console.log('Dev server stopped.');
}

if (MODE === 'start') start(); else if (MODE === 'stop') await stop(); else {
  console.error('Usage: node tools/web-dev-server.mjs <start|stop>');
  process.exit(1);
}
