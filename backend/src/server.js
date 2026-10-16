import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { createApp } from './app.js';

if (!fs.existsSync(path.join(config.dataDir, 'kdkmp_snapshot.json'))) {
  console.warn(`Tabel belum ada di ${config.dataDir}. Jalankan dulu: npm run seed`);
}
if (!config.adminToken) console.warn('ADMIN_TOKEN belum diset: endpoint /api/admin dinonaktifkan.');

const { app } = createApp();
app.listen(config.port, () => {
  console.log(`API observatorium di http://localhost:${config.port}/api (data: ${path.relative(process.cwd(), config.dataDir) || '.'})`);
});
