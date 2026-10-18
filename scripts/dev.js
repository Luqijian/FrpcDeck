import { spawn } from 'node:child_process';
import path from 'node:path';

const port = String(process.env.DEV_PORT || process.env.PORT || 8080);
const backendUrl = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: port,
  DEV_API_TARGET: backendUrl,
};

console.log(`\n  FrpcDeck 开发模式\n  后端  ${backendUrl}\n  前端  http://localhost:5173\n`);

const children = new Set();
let stopping = false;

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
    windowsHide: false,
  });
  children.add(child);
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping && children.size > 0) {
      stopAll(code ?? 1);
    }
  });
  return child;
}

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill('SIGINT');
    } catch {
      // Ignore.
    }
  }
  setTimeout(() => process.exit(code), 350);
}

const backend = run(process.execPath, ['--watch', 'server/index.js']);
const viteBin = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
const frontend = run(process.execPath, [viteBin, '--config', 'web/vite.config.js']);

process.on('SIGINT', () => {
  console.log('\n正在停止开发服务…');
  try {
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
  } catch {
    // Ignore.
  }
  stopAll(0);
});

process.on('SIGTERM', () => stopAll(0));
