import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/content/dom-utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/content/dom-utils')>();
  return { ...mod, isElementVisible: (el: Element) => el.closest('[hidden]') === null };
});

import { findCandidates } from '../../src/content/detector';
import { hasTopicWord } from '../../src/shared/keywords';

describe('hasTopicWord', () => {
  it('matches inflected forms by word prefix and multi-word phrases exactly', () => {
    expect(hasTopicWord('Klikając „Przejdź do serwisu” udzielasz zgody na przetwarzanie')).toBe(true);
    expect(hasTopicWord('Souhlasím se zpracováním')).toBe(true);
    expect(hasTopicWord('We use cookies')).toBe(true);
    expect(hasTopicWord('Používáme soubory cookie')).toBe(true);
    expect(hasTopicWord('Join our newsletter for recipes')).toBe(false);
  });
});

describe('findCandidates', () => {
  it('finds a consent dialog rendered in an open shadow root (Seznam-like)', () => {
    document.body.innerHTML = `<div id="app"><p>Hlavní obsah stránky bez lišty.</p></div><div id="host"></div>`;
    const host = document.getElementById('host')!;
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `
      <div class="dialog">
        <h2>Abyste mohli pokračovat, potřebujeme vědět, jakou formou vám můžeme zobrazovat reklamu</h2>
        <p>Než se rozhodnete, využíváme pouze nezbytné technické cookies.</p>
        <button>Souhlasím</button><button>Nastavení</button>
      </div>`;
    const cands = findCandidates(document);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.root).toBe(sr);
    expect(cands[0]!.cmpHint).toBe('');
  });

  it('prefers a known CMP container (seznam) with cmpHint', () => {
    document.body.innerHTML = `<div id="szn-cmp-dialog-container"></div>`;
    const host = document.getElementById('szn-cmp-dialog-container')!;
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<div><p>Používáme cookies, abychom vám mohli zobrazovat reklamu.</p><button>Souhlasím</button></div>`;
    const cands = findCandidates(document);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.cmpHint).toBe('seznam');
    expect(cands[0]!.root).toBe(sr);
  });

  it('ignores shadow roots without consent wording', () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const sr = document.getElementById('host')!.attachShadow({ mode: 'open' });
    sr.innerHTML = `<div><p>Search the catalogue and find your favourite products today.</p><button>Search</button></div>`;
    expect(findCandidates(document)).toHaveLength(0);
  });
});

describe('findCandidates in an iframe', () => {
  it('treats the frame body as the dialog when the whole frame is the banner', () => {
    document.body.innerHTML = `<div><p>Abyste mohli pokračovat, potřebujeme vědět, jakou formou vám můžeme zobrazovat reklamu. Využíváme pouze nezbytné technické cookies.</p><button>Souhlasím</button><button>Nastavení</button></div>`;
    const cands = findCandidates(document, true);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.root).toBe(document.body);
  });
  it('does not use the frame body for ordinary iframes', () => {
    document.body.innerHTML = `<div><p>Latest headlines from the newsroom.</p><button>Read more</button></div>`;
    expect(findCandidates(document, true)).toHaveLength(0);
  });
  it('never uses the top-level body as a candidate', () => {
    document.body.innerHTML = `<div><p>We use cookies.</p><button>OK</button></div>`;
    expect(findCandidates(document, false)).toHaveLength(0);
  });
});

describe('findCandidates — Seznam consent wall (szn-cwl)', () => {
  it('finds the dialog although the shadow root starts with a huge <style> block', () => {
    document.body.innerHTML = `<div id="app"><p>Seznam homepage</p></div><szn-cwl></szn-cwl>`;
    const host = document.querySelector('szn-cwl')!;
    const sr = host.attachShadow({ mode: 'open' });
    const css = '.cwl-dialog { cursor: pointer; box-sizing: border-box; } '.repeat(1500); // ~70 kB of CSS
    sr.innerHTML = `<style>${css}</style><div class="cwl-dialog"><h2>Abyste mohli pokračovat, potřebujeme vědět, jakou formou vám můžeme zobrazovat reklamu</h2><p>Než se rozhodnete, využíváme pouze nezbytné technické cookies.</p><button>Souhlasím</button><button>Nastavení</button></div>`;
    const cands = findCandidates(document, false);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.cmpHint).toBe('seznam');
    expect(cands[0]!.root).toBe(sr);
  });
});

describe('findCandidates in a button-only consent iframe (Seznam cmp.html)', () => {
  it('accepts a frame whose buttons read like a consent bar even without cookie wording', () => {
    document.body.innerHTML = `<div class="bar"><button>Souhlasím</button><button>Podrobné nastavení</button></div>`;
    const cands = findCandidates(document, true);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.root).toBe(document.body);
  });
  it('rejects a frame with unrelated buttons', () => {
    document.body.innerHTML = `<div><button>Play</button><button>Mute</button></div>`;
    expect(findCandidates(document, true)).toHaveLength(0);
  });
  it('rejects a frame with a lone OK button', () => {
    document.body.innerHTML = `<div><button>OK</button></div>`;
    expect(findCandidates(document, true)).toHaveLength(0);
  });
});
