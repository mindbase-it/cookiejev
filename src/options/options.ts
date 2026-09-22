import { applyI18n, t } from '../shared/i18n';
import { sendToBackground, type TestOpenJevResponse } from '../shared/messages';
import { loadSettings, normalizeSettings, saveSettings } from '../shared/settings';
import type { Settings } from '../shared/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

function readForm(): Settings {
  const policy = (document.querySelector<HTMLInputElement>('input[name="policy"]:checked')?.value ?? 'reject_all') as Settings['policy'];
  return normalizeSettings({
    enabled: true,
    policy,
    custom: {
      analytics: input('cat-analytics').checked,
      marketing: input('cat-marketing').checked,
      personalization: input('cat-personalization').checked,
      functional: input('cat-functional').checked,
    },
    openjev: { enabled: input('oj-enabled').checked, endpoint: input('oj-endpoint').value, token: input('oj-token').value },
    confidenceThreshold: parseFloat(input('threshold').value),
    disabledHosts: $<HTMLTextAreaElement>('hosts').value.split(/\r?\n/),
    showBadge: input('badge').checked,
  });
}

function fillForm(s: Settings): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="policy"][value="${s.policy}"]`);
  if (radio) radio.checked = true;
  input('cat-analytics').checked = s.custom.analytics;
  input('cat-marketing').checked = s.custom.marketing;
  input('cat-personalization').checked = s.custom.personalization;
  input('cat-functional').checked = s.custom.functional;
  input('oj-enabled').checked = s.openjev.enabled;
  input('oj-endpoint').value = s.openjev.endpoint;
  input('oj-token').value = s.openjev.token;
  input('threshold').value = String(s.confidenceThreshold);
  $<HTMLTextAreaElement>('hosts').value = s.disabledHosts.join('\n');
  input('badge').checked = s.showBadge;
  syncDerived();
}

function syncDerived(): void {
  const policy = document.querySelector<HTMLInputElement>('input[name="policy"]:checked')?.value;
  $<HTMLFieldSetElement>('categories').disabled = policy !== 'custom';
  $<HTMLOutputElement>('threshold-out').value = `${Math.round(parseFloat(input('threshold').value) * 100)} %`;
}

function flash(id: string, text: string, ok: boolean): void {
  const el = $(id);
  el.textContent = text;
  el.className = `result ${ok ? 'ok' : 'err'}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'result';
  }, 4000);
}

async function main(): Promise<void> {
  applyI18n();
  const current = await loadSettings();
  fillForm(current);

  document.querySelectorAll('input[name="policy"]').forEach((r) => r.addEventListener('change', syncDerived));
  input('threshold').addEventListener('input', syncDerived);

  $('oj-test').addEventListener('click', async () => {
    const res = await sendToBackground<TestOpenJevResponse>({ type: 'test-openjev', endpoint: input('oj-endpoint').value.trim(), token: input('oj-token').value });
    if (res.ok) flash('oj-test-result', t('testOk', res.model), true);
    else flash('oj-test-result', t('testFail', res.error), false);
  });

  $('clear-cache').addEventListener('click', async () => {
    await sendToBackground({ type: 'clear-cache' });
    flash('cache-result', t('cacheCleared'), true);
  });

  $<HTMLFormElement>('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prev = await loadSettings();
    const next = { ...readForm(), enabled: prev.enabled };
    await saveSettings(next);
    fillForm(await loadSettings());
    flash('save-result', t('saved'), true);
  });
}

void main();
