import { expect, test } from '@playwright/test';
import { FIXTURES, OPENJEV, launchExtension, type ExtensionSession } from './extension';

async function openjevRequests(): Promise<Array<{ state: string; questions: string[] }>> {
  const res = await fetch(`${OPENJEV}/__requests`);
  return (await res.json()) as Array<{ state: string; questions: string[] }>;
}

async function resetOpenJev(): Promise<void> {
  await fetch(`${OPENJEV}/__reset`);
}

test.describe('with OpenJev mock available', () => {
  let ext: ExtensionSession;

  test.beforeAll(async () => {
    test.setTimeout(400_000);
    ext = await launchExtension();
  });
  test.afterAll(async () => {
    await ext.close();
  });
  test.beforeEach(async () => {
    await resetOpenJev();
    await ext.setSettings({});
  });

  test('generic banner: clicks "Reject all", never "Accept all"', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-reject.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 10_000 });
    await expect(page.locator('#cookie-banner')).toBeHidden();
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/generic-reject.html`)).toMatchObject({ state: 'handled', source: 'openjev' });
    expect(await ext.openjevError(), 'OpenJev call from the service worker must succeed').toBeNull();
    await page.close();
  });

  test('generic banner without reject: opens settings, unchecks non-essential toggles, saves', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-settings.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'saved:ana=off,mkt=off,fun=off', { timeout: 15_000 });
    await page.close();
  });

  test('custom policy keeps allowed categories on', async () => {
    await ext.setSettings({ policy: 'custom', custom: { analytics: true, marketing: false, personalization: false, functional: true } });
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-settings.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'saved:ana=on,mkt=off,fun=on', { timeout: 15_000 });
    await page.close();
  });

  test('OneTrust-like markup: uses CMP rule, opens preference center and rejects there', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/onetrust-like.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 15_000 });
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/onetrust-like.html`)).toMatchObject({ state: 'handled', source: 'cmp-rule' });
    expect(await openjevRequests()).toHaveLength(0);
    await page.close();
  });

  test('novel wording: decided by OpenJev, only dialog text is sent', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/novel-banner.html`);
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/novel-banner.html`), { timeout: 15_000 }).not.toBeNull();
    expect(await ext.openjevError(), 'OpenJev call from the service worker must succeed').toBeNull();
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 15_000 });
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/novel-banner.html`)).toMatchObject({ state: 'handled', source: 'openjev' });
    const reqs = await openjevRequests();
    expect(reqs.length).toBeGreaterThan(0);
    const state = reqs[0]!.state;
    expect(state).toContain("Nope, I'm good");
    expect(state).not.toContain('127.0.0.1');
    expect(state).not.toContain('novel-banner');
    expect(reqs[0]!.questions).toEqual(expect.arrayContaining(['is_consent', 'reject_button', 'manage_button']));
    await page.close();
  });

  test('second visit is served from cache without calling OpenJev', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/novel-banner.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 15_000 });
    await resetOpenJev();
    await page.goto(`${FIXTURES}/novel-banner.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 15_000 });
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/novel-banner.html`)).toMatchObject({ state: 'handled', source: 'cache' });
    expect(await openjevRequests()).toHaveLength(0);
    await page.close();
  });

  test('banner inside an about:blank iframe (Seznam-like) is rejected', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/iframe-blank.html`);
    await page.waitForTimeout(2500);
    const frames = await ext.frames(`${FIXTURES}/iframe-blank.html`);
    const debug = await ext.debug(`${FIXTURES}/iframe-blank.html`);
    // document.write() gives the about:blank frame the parent's URL, so only assert that a sub-frame was injected.
    expect(frames, `content script must start in the iframe; frames=${JSON.stringify(frames)} debug=${JSON.stringify(debug)}`).toContainEqual(expect.objectContaining({ top: false }));
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 15_000 });
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/iframe-blank.html`)).toMatchObject({ state: 'handled' });
    await page.close();
  });

  test('consent teaser (Seznam-like szn-cwl strip) is clicked open, then rejected', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/teaser-consent.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 15_000 });
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/teaser-consent.html`)).toMatchObject({ state: 'handled' });
    await page.close();
  });

  test('newsletter modal is left alone', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/no-banner.html`);
    await page.waitForTimeout(2500);
    expect(await page.locator('body').getAttribute('data-result')).toBeNull();
    await expect(page.locator('#news')).toBeVisible();
    await page.close();
  });

  test('paused host is not touched', async () => {
    await ext.setSettings({ disabledHosts: ['127.0.0.1'] });
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-reject.html`);
    await page.waitForTimeout(2000);
    expect(await page.locator('body').getAttribute('data-result')).toBeNull();
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/generic-reject.html`)).toMatchObject({ state: 'disabled-host' });
    await page.close();
  });

  test('accept_all policy clicks accept', async () => {
    await ext.setSettings({ policy: 'accept_all' });
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-reject.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'accepted', { timeout: 10_000 });
    await page.close();
  });
});

test.describe('without OpenJev (endpoint unreachable)', () => {
  let ext: ExtensionSession;

  test.beforeAll(async () => {
    test.setTimeout(400_000);
    ext = await launchExtension({ openjev: { enabled: true, endpoint: 'http://127.0.0.1:1', token: '' } });
  });
  test.afterAll(async () => {
    await ext.close();
  });

  test('heuristics still reject a generic banner', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-reject.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'rejected', { timeout: 10_000 });
    await expect.poll(() => ext.tabStatus(`${FIXTURES}/generic-reject.html`)).toMatchObject({ state: 'handled', source: 'heuristic' });
    await page.close();
  });

  test('heuristics handle the settings flow', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/generic-settings.html`);
    await expect(page.locator('body')).toHaveAttribute('data-result', 'saved:ana=off,mkt=off,fun=off', { timeout: 15_000 });
    await page.close();
  });

  test('novel wording without OpenJev: does nothing rather than accepting', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${FIXTURES}/novel-banner.html`);
    await page.waitForTimeout(3000);
    expect(await page.locator('body').getAttribute('data-result')).toBeNull();
    await page.close();
  });
});
