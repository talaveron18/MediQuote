import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nextCli = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const url = 'http://localhost:3000';

const server = spawn(process.execPath, [nextCli, 'dev', '-p', '3000'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: 'inherit',
});

let opened = false;
async function openWhenReady() {
  const deadline = Date.now() + 90_000;
  while (!opened && Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status > 0) {
        opened = true;
        if (process.platform === 'win32') {
          spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', url], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          }).unref();
        }
        console.log('\nMediQuote Build Week abierto en ' + url + '\n');
        return;
      }
    } catch {
      // El servidor todavía está arrancando.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}

openWhenReady();

server.on('exit', (code) => {
  if (code && code !== 0) {
    console.error('\nEl servidor se cerró con código ' + code + '.\n');
  }
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (server.exitCode === null) server.kill(signal);
  });
}
