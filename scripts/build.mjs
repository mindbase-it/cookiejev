// Bundles the extension into dist/ with esbuild. Usage: node scripts/build.mjs [--watch]
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = {
  'background/index': path.join(src, 'background/index.ts'),
  'content/index': path.join(src, 'content/index.ts'),
  'popup/popup': path.join(src, 'popup/popup.ts'),
  'options/options': path.join(src, 'options/options.ts'),
};

async function copyStatic() {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(src, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const staticDirs = ['_locales', 'icons'];
  for (const dir of staticDirs) {
    if (existsSync(path.join(src, dir))) {
      await cp(path.join(src, dir), path.join(dist, dir), { recursive: true });
    }
  }
  const staticFiles = ['popup/popup.html', 'popup/popup.css', 'options/options.html', 'options/options.css'];
  for (const f of staticFiles) {
    await mkdir(path.dirname(path.join(dist, f)), { recursive: true });
    await cp(path.join(src, f), path.join(dist, f));
  }
}

/**
 * Content scripts are classic scripts: a stray top-level `export` (e.g. an exported helper in
 * src/content/index.ts) makes esbuild emit `export {...}` and the whole file becomes a syntax error.
 */
async function assertClassicScript(file) {
  const code = await readFile(file, 'utf8');
  const exportStatement = new RegExp(String.raw`(^|[;\n\r])\s*export\s*[{*]|\bexport\s+(default|function|const|let|var|class)\b`);
  if (exportStatement.test(code)) {
    throw new Error(`${path.relative(root, file)} contains an ES module export; content scripts must not export`);
  }
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await copyStatic();

  /** @type {import('esbuild').BuildOptions} */
  const options = {
    entryPoints,
    outdir: dist,
    bundle: true,
    format: 'esm',
    target: ['chrome120', 'edge120'],
    sourcemap: false,
    minify: !watch,
    logLevel: 'info',
    define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.warn('watching…');
  } else {
    await esbuild.build(options);
    await assertClassicScript(path.join(dist, 'content/index.js'));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
