import { applyI18n, t } from '../shared/i18n';
import { sendToBackground } from '../shared/messages';
import { isHostDisabled, loadSettings, saveSettings } from '../shared/settings';
import type { DecisionSource, Settings, TabStatus } from '../shared/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SOURCE_KEY: Record<DecisionSource, string> = {
  'cmp-rule': 'sourceCmpRule',
  openjev: 'sourceOpenjev',
  heuristic: 'sourceHeuristic',
  cache: 'sourceCache',
};

const POLICY_KEY: Record<Settings['policy'], string> = {
  reject_all: 'policyRejectAllShort',
  accept_all: 'policyAcceptAllShort',
  custom: 'policyCustomShort',
};

async function currentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostnameOf(tab: chrome.tabs.Tab | undefined): string {
  try {
    return tab?.url ? new URL(tab.url).hostname : '';
  } catch {
    return '';
  }
}

function renderStatus(status: TabStatus, settings: Settings, hostname: string): void {
  const icon = $('status-icon');
  const text = $('status-text');
  const detail = $('status-detail');
  icon.className = 'status-icon';
  detail.textContent = '';
  if (!settings.enabled) {
    icon.classList.add('muted');
    icon.textContent = '–';
    text.textContent = t('statusExtensionOff');
    return;
  }
  if (hostname && isHostDisabled(hostname, settings.disabledHosts)) {
    icon.classList.add('muted');
    icon.textContent = '–';
    text.textContent = t('statusDisabledHost');
    return;
  }
  switch (status.state) {
    case 'handled':
      icon.classList.add('ok');
      icon.textContent = '✓';
      text.textContent = t('statusHandled');
      detail.textContent = `${t('labelSource')}: ${t(SOURCE_KEY[status.source])} · ${t('labelConfidence')}: ${Math.round(status.confidence * 100)} % · ${t('labelRounds')}: ${status.rounds}`;
      break;
    case 'failed':
      icon.classList.add('err');
      icon.textContent = '!';
      text.textContent = t('statusFailed');
      detail.textContent = status.reason;
      break;
    case 'not-consent':
      icon.classList.add('muted');
      icon.textContent = '·';
      text.textContent = t('statusNotConsent');
      break;
    case 'disabled-host':
      icon.classList.add('muted');
      icon.textContent = '–';
      text.textContent = t('statusDisabledHost');
      break;
    default:
      icon.classList.add('muted');
      icon.textContent = '·';
      text.textContent = t('statusIdle');
  }
}

async function main(): Promise<void> {
  applyI18n();
  const tab = await currentTab();
  const hostname = hostnameOf(tab);
  let settings = await loadSettings();
  const status: TabStatus = tab?.id !== undefined ? await sendToBackground<TabStatus>({ type: 'get-tab-status', tabId: tab.id }) : { state: 'idle' };

  const enabled = $<HTMLInputElement>('enabled');
  const pause = $<HTMLButtonElement>('pause');
  const rerun = $<HTMLButtonElement>('rerun');

  const refresh = () => {
    enabled.checked = settings.enabled;
    $('policy').textContent = t(POLICY_KEY[settings.policy]);
    const paused = hostname !== '' && isHostDisabled(hostname, settings.disabledHosts);
    pause.textContent = paused ? t('btnResumeHere') : t('btnPauseHere');
    pause.disabled = hostname === '';
    rerun.disabled = !settings.enabled || paused || tab?.id === undefined || !(tab.url ?? '').startsWith('http');
    renderStatus(status, settings, hostname);
  };
  refresh();

  enabled.addEventListener('change', async () => {
    settings = { ...settings, enabled: enabled.checked };
    await saveSettings(settings);
    refresh();
  });

  pause.addEventListener('click', async () => {
    if (!hostname) return;
    const paused = isHostDisabled(hostname, settings.disabledHosts);
    const hosts = paused ? settings.disabledHosts.filter((h) => hostname !== h && !hostname.endsWith('.' + h)) : [...settings.disabledHosts, hostname];
    settings = { ...settings, disabledHosts: hosts };
    await saveSettings(settings);
    refresh();
  });

  rerun.addEventListener('click', async () => {
    if (tab?.id === undefined) return;
    rerun.disabled = true;
    await sendToBackground({ type: 'rerun', tabId: tab.id });
    setTimeout(() => window.close(), 300);
  });

  $('options').addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  });
}

void main();
