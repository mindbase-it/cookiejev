import { describe, expect, it } from 'vitest';
import { dispatchClick, executePlan, setToggle } from '../../src/content/executor';
import type { ActionPlan } from '../../src/shared/types';

function plan(steps: ActionPlan['steps']): ActionPlan {
  return { steps, source: 'heuristic', confidence: 1, expectMoreRounds: false, reason: 't' };
}

describe('executePlan', () => {
  it('clicks buttons, toggles checkboxes, skips missing elements', async () => {
    document.body.innerHTML = `
      <button id="b">Reject</button>
      <input type="checkbox" id="c" checked>
      <div role="switch" aria-checked="true" id="s"></div>`;
    const b = document.getElementById('b')!;
    const c = document.getElementById('c') as HTMLInputElement;
    const s = document.getElementById('s')!;
    let clicked = 0;
    b.addEventListener('click', () => clicked++);
    s.addEventListener('click', () => s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true'));

    const map = new Map<string, Element>([
      ['e0', b],
      ['e1', c],
      ['e2', s],
    ]);
    const res = await executePlan(
      plan([
        { type: 'setToggle', key: 'e1', on: false },
        { type: 'setToggle', key: 'e2', on: false },
        { type: 'wait', ms: 1 },
        { type: 'click', key: 'e0' },
        { type: 'click', key: 'e9' },
      ]),
      map,
    );
    expect(clicked).toBe(1);
    expect(c.checked).toBe(false);
    expect(s.getAttribute('aria-checked')).toBe('false');
    expect(res).toEqual({ clicked: ['e0'], toggled: ['e1', 'e2'], missing: ['e9'] });
  });

  it('clicking a javascript: link runs site handlers but prevents the CSP-blocked navigation', () => {
    document.body.innerHTML = `<div id="wrap"><a href="javascript:void(0)" id="l">Nastavení</a></div>`;
    const a = document.getElementById('l')!;
    let own = 0;
    let delegated = 0;
    let defaultPrevented: boolean | null = null;
    a.addEventListener('click', () => own++);
    document.getElementById('wrap')!.addEventListener('click', (e) => {
      delegated++;
      defaultPrevented = e.defaultPrevented;
    });
    dispatchClick(a);
    expect(own).toBe(1);
    expect(delegated).toBe(1);
    expect(defaultPrevented).toBe(true);
  });

  it('setToggle is a no-op when already in the desired state', async () => {
    document.body.innerHTML = `<input type="checkbox" id="c">`;
    const c = document.getElementById('c') as HTMLInputElement;
    let clicks = 0;
    c.addEventListener('click', () => clicks++);
    expect(await setToggle(c, false)).toBe(true);
    expect(clicks).toBe(0);
  });

  it('setToggle falls back to the label and then to direct assignment', async () => {
    document.body.innerHTML = `<label for="c">Analytics</label><input type="checkbox" id="c" checked>`;
    const c = document.getElementById('c') as HTMLInputElement;
    // Prevent default on the input click so only the label path can flip it.
    let phase = 0;
    c.addEventListener('click', (e) => {
      if (phase === 0) e.preventDefault();
    });
    phase = 0;
    expect(await setToggle(c, false)).toBe(true);
    expect(c.checked).toBe(false);
  });
});
