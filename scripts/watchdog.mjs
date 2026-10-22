// Watchdog: keeps `npm run dev` alive on :5173. Run detached; auto-restarts vite.
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5173;

const alive = () => {
  try {
    execSync(`curl.exe -s -m 3 -o NUL http://localhost:${PORT}/`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

let child = null;
const start = () => {
  child = spawn('cmd.exe', ['/c', 'npm run dev > dev.log 2>&1'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  console.log(new Date().toISOString(), 'dev launched, pid', child.pid);
};

for (;;) {
  if (!alive()) {
    console.log(new Date().toISOString(), 'port dead, restarting');
    start();
    await new Promise((r) => setTimeout(r, 30000));
  }
  await new Promise((r) => setTimeout(r, 15000));
}
