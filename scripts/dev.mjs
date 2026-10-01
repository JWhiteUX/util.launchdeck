// Runs the server and web dev processes in parallel; Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Share .env (e.g. WEB_PORT, PORT) with both child processes.
if (existsSync('.env')) process.loadEnvFile('.env');

const procs = [
  ['server', ['run', 'dev', '-w', '@launchdeck/server']],
  ['web', ['run', 'dev', '-w', '@launchdeck/web']],
].map(([name, args]) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (line) => `[${name}] ${line}`;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) console.log(prefix(line));
    });
  }
  child.on('exit', (code) => {
    console.log(prefix(`exited with code ${code}`));
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
