/**
 * Broad real-world survey: loads the built extension into Chromium, visits real EU sites and
 * records per site what the extension reported plus diagnostics (frames, fixed overlays, engine
 * snapshot, screenshot). Runs only with REAL_SITES=1. Output: test-results/real-sites.{json,md}
 * and test-results/shots/<host>.png.
 */
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchExtension, type ExtensionSession } from './extension';

const SITES = (process.env.REAL_SITES_LIST?.split(',').map((s) => s.trim()).filter(Boolean)) ?? [
  // CZ / SK
  'https://www.seznam.cz/',
  'https://www.idnes.cz/',
  'https://www.novinky.cz/',
  'https://www.aktualne.cz/',
  'https://www.denik.cz/',
  'https://www.blesk.cz/',
  'https://www.ceskatelevize.cz/',
  'https://www.irozhlas.cz/',
  'https://www.alza.cz/',
  'https://www.mall.cz/',
  'https://www.heureka.cz/',
  'https://www.csfd.cz/',
  'https://www.sme.sk/',
  'https://www.aktuality.sk/',
  // DE / AT
  'https://www.spiegel.de/',
  'https://www.zeit.de/',
  'https://www.bild.de/',
  'https://www.heise.de/',
  'https://www.chip.de/',
  'https://www.derstandard.at/',
  // FR
  'https://www.lemonde.fr/',
  'https://www.lefigaro.fr/',
  'https://www.leboncoin.fr/',
  // IT / ES / PT
  'https://www.corriere.it/',
  'https://www.repubblica.it/',
  'https://elpais.com/',
  'https://www.elmundo.es/',
  'https://www.publico.pt/',
  // PL / HU / NL / SE / DK
  'https://www.onet.pl/',
  'https://www.wp.pl/',
  'https://index.hu/',
  'https://www.nu.nl/',
  'https://www.aftonbladet.se/',
  'https://www.dr.dk/',
  // UK / international with EU banners
  'https://www.bbc.com/',
  'https://www.theguardian.com/europe',
  'https://www.reuters.com/',
  'https://stackoverflow.com/',
  'https://www.booking.com/',
  'https://www.ikea.com/cz/cs/',
];

interface Row {
  site: string;
  state: string;
  source?: string;
  reason?: string;
  rounds?: number;
  ms: number;
  frames?: string[];
  overlays?: string[];
  debug?: unknown;
  /** Frames where the content script actually started. */
  injected?: unknown;
  /** Playwright-side probe of every frame: what is really rendered where. */
  frameProbe?: FrameProbe[];
}

interface FrameProbe {
  url: string;
  visible: boolean | null;
  size: string;
  text: string;
  buttons: string[];
  shadowHosts: number;
}

/** Runs inside the page: lists iframes and visible fixed/sticky containers with a text preview. */
function pageDiagnostics(): { frames: string[]; overlays: string[] } {
  const frames = Array.from(document.querySelectorAll('iframe'))
    .map((f) => (f.getAttribute('src') || f.id || f.title || '?').slice(0, 120))
    .filter((s) => s && s !== '?')
    .slice(0, 15);
  const overlays: string[] = [];
  const all = Array.from(document.querySelectorAll('body *')).slice(0, 4000);
  for (const el of all) {
    if (!(el instanceof HTMLElement)) continue;
    const st = getComputedStyle(el);
    if (st.position !== 'fixed' && st.position !== 'sticky') continue;
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 60) continue;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length < 20) continue;
    const tag = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
    overlays.push(`${tag} [${Math.round(r.width)}x${Math.round(r.height)}] ${text.slice(0, 160)}`);
    if (overlays.length >= 8) break;
  }
  return { frames, overlays };
}

test.describe('real sites survey', () => {
  test.skip(process.env.REAL_SITES !== '1', 'set REAL_SITES=1 to run against the live web');
  let ext: ExtensionSession;

  test.beforeAll(async () => {
    test.setTimeout(400_000);
    ext = await launchExtension({ openjev: { enabled: false, endpoint: 'http://127.0.0.1:1', token: '' } }, { locale: 'cs-CZ' });
  });
  test.afterAll(async () => {
    await ext.close();
  });

  test('survey', async () => {
    test.setTimeout(SITES.length * 30_000);
    await mkdir('test-results/shots', { recursive: true });
    const rows: Row[] = [];
    for (const site of SITES) {
      const page = await ext.context.newPage();
      const t0 = Date.now();
      const host = new URL(site).hostname;
      let row: Row = { site, state: 'error', ms: 0 };
      try {
        await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined);
        const pattern = `${new URL(site).origin}/*`;
        let status: Record<string, unknown> | null = null;
        for (let i = 0; i < 12; i++) {
          await page.waitForTimeout(1000);
          status = (await ext.tabStatus(pattern)) as Record<string, unknown> | null;
          if (status && status.state !== 'idle') break;
        }
        // Let multi-round flows (settings iframe) settle, then read the final status.
        await page.waitForTimeout(3000);
        status = ((await ext.tabStatus(pattern)) as Record<string, unknown> | null) ?? status;
        const diag = await page.evaluate(pageDiagnostics).catch(() => ({ frames: [], overlays: [] }));
        const debug = await ext.debug(pattern).catch(() => null);
        const injected = await ext.frames(pattern).catch(() => []);
        const frameProbe: FrameProbe[] = [];
        for (const fr of page.frames()) {
          try {
            const probe = await fr.evaluate(() => {
              const body = document.body;
              const text = (body?.innerText || body?.textContent || '').replace(/\s+/g, ' ').trim();
              const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
                .map((b) => ((b as HTMLElement).innerText || (b as HTMLInputElement).value || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 12);
              let shadowHosts = 0;
              for (const el of Array.from(document.querySelectorAll('*')).slice(0, 5000)) if (el.shadowRoot) shadowHosts++;
              const fe = window.frameElement as HTMLElement | null;
              let visible: boolean | null = null;
              let size = '';
              if (fe) {
                const r = fe.getBoundingClientRect();
                const st = getComputedStyle(fe);
                visible = r.width > 10 && r.height > 10 && st.display !== 'none' && st.visibility !== 'hidden';
                size = `${Math.round(r.width)}x${Math.round(r.height)}`;
              }
              return { text: text.slice(0, 160), buttons, shadowHosts, visible, size };
            });
            if (probe.text.length > 0 || probe.buttons.length > 0) frameProbe.push({ url: fr.url().slice(0, 100), ...probe });
          } catch {
            /* cross-process / detached frame */
          }
          if (frameProbe.length >= 25) break;
        }
        await page.screenshot({ path: `test-results/shots/${host}.png`, fullPage: false }).catch(() => undefined);
        row = {
          site,
          state: status ? String(status.state) : 'idle',
          ...(status?.source ? { source: String(status.source) } : {}),
          ...(status?.reason ? { reason: String(status.reason) } : {}),
          ...(typeof status?.rounds === 'number' ? { rounds: status.rounds } : {}),
          ms: Date.now() - t0,
          frames: diag.frames,
          overlays: diag.overlays,
          debug,
          injected,
          frameProbe,
        };
      } catch (err) {
        row = { site, state: 'error', reason: String(err).slice(0, 120), ms: Date.now() - t0 };
      } finally {
        await page.close().catch(() => undefined);
      }
      rows.push(row);
      console.warn(`${row.state.padEnd(12)} ${(row.source ?? '').padEnd(10)} ${site}  ${row.reason ?? ''}`);
    }

    await writeFile('test-results/real-sites.json', JSON.stringify(rows, null, 2));
    const counts = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.state] = (acc[r.state] ?? 0) + 1), acc), {});
    const md = [
      `# Real sites survey (${new Date().toISOString()})`,
      '',
      `Totals: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`,
      '',
      '| site | state | source | rounds | reason |',
      '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.site} | ${r.state} | ${r.source ?? ''} | ${r.rounds ?? ''} | ${r.reason ?? ''} |`),
    ].join('\n');
    await writeFile('test-results/real-sites.md', md);
    console.warn(md);
    expect(rows.length).toBe(SITES.length);
  });
});
