// Menjalankan backend dan frontend bersamaan untuk pengembangan lokal.
import { spawn } from 'node:child_process';

const procs = [
  ['backend', ['run', 'dev', '-w', 'backend']],
  ['frontend', ['run', 'dev', '-w', 'frontend']],
].map(([name, args]) => {
  const p = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] keluar dengan kode ${code}`);
    procs.forEach((q) => q !== p && q.kill());
    process.exit(code ?? 0);
  });
  return p;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill('SIGINT')));
