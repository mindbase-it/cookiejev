import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/content/dom-utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/content/dom-utils')>();
  return { ...mod, isElementVisible: (el: Element) => el.closest('[hidden]') === null };
});

import { buildSnapshot } from '../../src/content/snapshot';

describe('buildSnapshot', () => {
  it('captures buttons, links, toggles with labels and skips navigation links', () => {
    document.documentElement.lang = 'cs';
    document.body.innerHTML = `
      <div id="dlg">
        <p>Používáme cookies. <a href="https://example.org/privacy">Zásady</a></p>
        <button id="acc" class="btn primary">Přijmout vše</button>
        <a href="#" id="rej">Odmítnout</a>
        <a href="javascript:void(0)" role="button">Nastavení</a>
        <button hidden>Skryté</button>
        <label for="c1">Analytické</label><input type="checkbox" id="c1" checked>
        <div role="switch" aria-checked="false" aria-label="Marketing"></div>
        <input type="checkbox" id="c2" disabled checked><label for="c2">Nezbytné</label>
      </div>`;
    const { snapshot, map } = buildSnapshot(document.getElementById('dlg')!, 'x', 2);
    expect(snapshot.lang).toBe('cs');
    expect(snapshot.cmpHint).toBe('x');
    expect(snapshot.round).toBe(2);
    expect(snapshot.dialogText).toContain('Používáme cookies');
    const byText = Object.fromEntries(snapshot.elements.map((e) => [e.text, e]));
    expect(byText['Přijmout vše']).toMatchObject({ kind: 'button', id: 'acc', classes: 'btn primary', disabled: false });
    expect(byText['Odmítnout']).toMatchObject({ kind: 'link' });
    expect(byText['Nastavení']).toMatchObject({ kind: 'button' });
    expect(byText['Zásady']).toBeUndefined();
    expect(byText['Skryté']).toBeUndefined();
    expect(byText['Analytické']).toMatchObject({ kind: 'checkbox', checked: true });
    expect(byText['Marketing']).toMatchObject({ kind: 'switch', checked: false });
    expect(byText['Nezbytné']).toMatchObject({ kind: 'checkbox', disabled: true });
    expect(map.get(byText['Přijmout vše']!.key)).toBe(document.getElementById('acc'));
  });

  it('keeps visually hidden toggles with a visible label but drops toggles in a collapsed panel', () => {
    document.body.innerHTML = `
      <div id="dlg">
        <p>We use cookies</p>
        <button>Settings</button>
        <label for="styled">Marketing</label><input type="checkbox" id="styled" hidden checked>
        <div id="panel" hidden>
          <label for="p1">Analytics</label><input type="checkbox" id="p1" checked>
          <button>Save</button>
        </div>
      </div>`;
    const { snapshot } = buildSnapshot(document.getElementById('dlg')!, '', 1);
    const texts = snapshot.elements.map((e) => e.text);
    expect(texts).toContain('Settings');
    expect(texts).toContain('Marketing');
    expect(texts).not.toContain('Analytics');
    expect(texts).not.toContain('Save');
  });
});
