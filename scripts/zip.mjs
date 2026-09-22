// Packages dist/ into release/cookiejev-<version>.zip for store upload.
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');

async function main() {
  await stat(path.join(dist, 'manifest.json')).catch(() => {
    throw new Error('dist/manifest.json missing — run `npm run build` first');
  });
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await mkdir(release, { recursive: true });
  const out = path.join(release, `cookiejev-${pkg.version}.zip`);

  await new Promise((resolve, reject) => {
    const output = createWriteStream(out);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(dist, false);
    archive.finalize();
  });
  console.warn(`written ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
