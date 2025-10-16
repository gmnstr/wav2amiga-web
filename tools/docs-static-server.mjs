import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OUT_DIR } from './lib/paths.mjs';
import { writePidFile, readPid, killPid, ensureDir } from './lib/process-utils.mjs';

const __filename = fileURLToPath(import.meta.url);

const MODE = process.argv[2] || 'start';
const PORT = Number(process.env.W2A_DOCS_PORT || 5174);
const ROOT = path.resolve('docs');
const PID_PATH = path.join(OUT_DIR, 'pids', 'docs-server.pid');

function contentType(ext) {
  return ({
    '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
    '.json':'application/json', '.wasm':'application/wasm', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon'
  })[ext] || 'application/octet-stream';
}

function startDetached() {
  if (fs.existsSync(PID_PATH)) { 
    console.error('Docs server appears to be running. Use stop first.'); 
    process.exit(2); 
  }
  const child = spawn(process.execPath, [__filename, 'run', String(PORT), ROOT], { 
    stdio: 'ignore', 
    detached: true 
  });
  writePidFile(PID_PATH, child.pid);
  child.unref();
  console.log(`Docs server starting on http://localhost:${PORT}/ (root=${ROOT}) (pidfile: ${PID_PATH})`);
}

function runServer(port, root) {
  ensureDir(path.dirname(PID_PATH));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const rel = pathname.replace(/^\/+/, '');
    const filePath = path.join(root, rel);
    const safeRoot = path.resolve(root) + path.sep;
    const safe = path.resolve(filePath).startsWith(safeRoot);
    if (!safe || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const fb = path.join(root, '404.html');
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (fs.existsSync(fb)) fs.createReadStream(fb).pipe(res); else res.end('404');
      return;
    }
    res.setHeader('Content-Type', contentType(path.extname(filePath).toLowerCase()));
    fs.createReadStream(filePath).pipe(res);
  });
  server.listen(port, '0.0.0.0', () => console.log(`Serving ${root} at http://localhost:${port}/`));
}

async function stop() {
  const pid = readPid(PID_PATH);
  if (!pid) { console.log('No docs server pid found.'); return; }
  try { await killPid(pid); } finally { try { fs.unlinkSync(PID_PATH); } catch {} }
  console.log('Docs server stopped.');
}

if (MODE === 'start') startDetached();
else if (MODE === 'run') runServer(Number(process.argv[3]), process.argv[4]);
else if (MODE === 'stop') await stop();
else { console.error('Usage: node tools/docs-static-server.mjs <start|stop>'); process.exit(1); }
