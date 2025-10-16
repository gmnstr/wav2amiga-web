import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(p) { 
  fs.mkdirSync(p, { recursive: true }); 
}

export function writePidFile(pidPath, pid) {
  ensureDir(path.dirname(pidPath));
  fs.writeFileSync(pidPath, String(pid));
}

export function readPid(pidPath) {
  if (!fs.existsSync(pidPath)) return null;
  const n = Number(fs.readFileSync(pidPath, 'utf8').trim());
  return Number.isFinite(n) ? n : null;
}

export async function killPid(pid, timeoutMs = 5000) {
  try { 
    process.kill(pid, 'SIGTERM'); 
  } catch (e) { 
    if (e.code === 'ESRCH') return true; 
    throw e; 
  }
  
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { 
      process.kill(pid, 0); 
    } catch (e) { 
      if (e.code === 'ESRCH') return true; 
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  try { 
    process.kill(pid, 'SIGKILL'); 
  } catch (e) { 
    if (e.code === 'ESRCH') return true; 
    throw e; 
  }
  return true;
}
