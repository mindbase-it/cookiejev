/**
 * Broad real-world survey: loads the built extension into Chromium, visits real EU sites and
 * records per site what the extension reported. Runs only with REAL_SITES=1 (network access,
 * non-deterministic). Produces test-results/real-sites.json + a markdown summary.
 */
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchExtension, type ExtensionSession } from './extension';

const SITES = [
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
}

test.describe('real sites survey', () => {
  test.skip(process.env.REAL_SITES !== '1', 'set REAL_SITES=1 to run against the live web');
  let ext: ExtensionSession;

  test.beforeAll(async () => {
    test.setTimeout(400_000);
    ext = await launchExtension({ openjev: { enabled: false, endpoint: 'http://127.0.0.1:1', token: '' } });
  });
  test.afterAll(async () => {
    await ext.close();
  });

  test('survey', async () => {
    test.setTimeout(SITES.length * 25_000);
    const rows: Row[] = [];
    for (const site of SITES) {
      const page = await ext.context.newPage();
      const t0 = Date.now();
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
        row = {
          site,
          state: status ? String(status.state) : 'idle',
          ...(status?.source ? { source: String(status.source) } : {}),
          ...(status?.reason ? { reason: String(status.reason) } : {}),
          ...(typeof status?.rounds === 'number' ? { rounds: status.rounds } : {}),
          ms: Date.now() - t0,
        };
      } catch (err) {
        row = { site, state: 'error', reason: String(err).slice(0, 120), ms: Date.now() - t0 };
      } finally {
        await page.close().catch(() => undefined);
      }
      rows.push(row);
      console.warn(`${row.state.padEnd(14)} ${(row.source ?? '').padEnd(10)} ${site}  ${row.reason ?? ''}`);
    }

    await mkdir('test-results', { recursive: true });
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
