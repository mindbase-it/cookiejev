# CookieJev — design spec

Datum: 2026-09-22 · Stav: schváleno (autonomní režim, rozhodnutí zdokumentována níže)

## 1. Cíl

Bezplatné rozšíření pro Chrome a Edge (Manifest V3, jeden build pro oba), které
na stránkách v EU detekuje dialogy pro (ne)souhlas s cookies, a podle politiky
zvolené v nastavení (výchozí: **odmítnout vše kromě nezbytných**) rozhodne, na co
kliknout a které přepínače přepnout, a dialog vyřídí bez zásahu uživatele.

Rozhodovací vrstva používá **OpenJev** — open-weights rozhodovací model
(`choice` / `noul` / `score`, HTTP API `POST /v1/systemone`). OpenJev neběží
v prohlížeči (27B, resp. Open-Jev 2B/9B na Qwen3.5), takže rozšíření volá
uživatelem nakonfigurovaný endpoint (výchozí `http://127.0.0.1:3000`).
Když endpoint není dostupný, rozšíření musí fungovat dál (heuristický fallback).

Cílem je publikace v Chrome Web Store a Microsoft Edge Add-ons jako oficiální,
bezplatné rozšíření. Publikace samotná vyžaduje vývojářské účty vlastníka —
repo obsahuje kompletní balíček (zip, listing, privacy policy, návod).

## 2. Ne-cíle (YAGNI)

- Žádné skrývání bannerů CSS injekcí bez skutečného odmítnutí (to dělá „I still
  don't care about cookies"; my chceme skutečné odmítnutí).
- Žádný cloudový backend provozovaný námi. Rozšíření je čistý klient.
- Žádná telemetrie. Žádné odesílání URL/obsahu stránky mimo snapshot dialogu.
- Žádný účet, žádná monetizace.
- Nepřebíráme 200+ pravidel Consent-O-Matic; máme malou vestavěnou sadu
  pro top CMP a zbytek řeší OpenJev + heuristika.

## 3. Architektura

```
┌──────────────── stránka (all_frames) ────────────────┐
│ content script                                        │
│  detector → snapshot dialogu → (zpráva) →             │
│  ← plán akcí ← ; executor kliká / přepíná / čeká      │
└───────────────────────────┬───────────────────────────┘
                            │ chrome.runtime messaging
┌───────────────────────────▼───────────────────────────┐
│ service worker (background)                            │
│  DecisionEngine:                                       │
│   T0 known-CMP rules (deterministické)                 │
│   T1 OpenJev client  (HTTP, choice+noul)               │
│   T2 heuristics       (multijazyčný keyword scoring)   │
│  PlanCache (per hostname, chrome.storage.local)        │
│  Settings (chrome.storage.sync)                        │
└───────────────────────────┬───────────────────────────┘
        ┌───────────────────┴──────────────┐
   options page                          popup
   (politika, endpoint, allowlist)   (stav tabu, re-run, pause)
```

### 3.1 Content script (`src/content/`)

- Spouští se `document_idle`, `all_frames: true` (CMP často v iframe —
  Sourcepoint, Quantcast).
- **Detector**: kandidáti = viditelné elementy s `position: fixed|sticky`
  nebo `role=dialog|alertdialog` nebo `aria-modal`, s plochou > 2 % viewportu
  nebo velkým z-indexem, jejichž text obsahuje klíčové slovo ze slovníku
  (cookie, cookies, souhlas, consent, Zustimmung, ciasteczka, sütik,
  evästeet, … ~15 EU jazyků) a zároveň obsahuje ≥ 1 interaktivní prvek.
  Známé CMP kontejnery (`#onetrust-banner-sdk`, `#CybotCookiebotDialog`,
  `#usercentrics-root` (shadow), `#didomi-host`, `.qc-cmp2-container`,
  `#sp_message_container_*`, `.klaro`, `.cky-consent-container`, …) se berou
  přímo.
- `MutationObserver` s debounce 300 ms, časový limit 20 s po načtení, po
  vyřízení sledování končí. Ochrana proti smyčce: max 3 kola na stránku,
  každý prvek klikneme nejvýš jednou.
- **Snapshot** (`DialogSnapshot`): `{ dialogText (max 1500 zn.), lang,
  cmpHint, elements: [{ key, tag, role, text, ariaLabel, checked?, disabled,
  kind: button|link|checkbox|switch|radio }] }`. Klíč `key` je stabilní
  index; skutečný DOM element zůstává v mapě uvnitř content scriptu.
  Snapshot neobsahuje URL, cookies ani obsah stránky mimo dialog.
- **Executor**: provádí `ActionPlan = { steps: Step[] }`, kde
  `Step = click(key) | setToggle(key, on) | wait(ms)`. Po každém
  kroku, který mění DOM (klik na „Nastavení"), pošle nový snapshot
  (další kolo, max 3 kola).

### 3.2 Service worker — DecisionEngine (`src/background/`)

Vstup: snapshot + politika. Výstup: plán + zdroj rozhodnutí + confidence.

1. **T0 Known-CMP rules** (`src/engine/cmp-rules.ts`): pro `cmpHint` známe
   selektory tlačítek „Reject all"/„Save"/„Manage" a přepínačů kategorií.
   Když pravidlo pasuje na snapshot → hotovo, bez sítě.
2. **T1 OpenJev** (`src/engine/openjev-client.ts`):
   - `is_consent_dialog` (noul): „Je toto dialog o souhlasu s cookies/
     sledováním?" — práh 0,6, jinak ignorovat.
   - `action` (choice): kritéria = klíče interaktivních prvků + `none`
     (popis = text prvku). Instrukce parametrizovaná politikou, např.
     „User wants to reject all non-essential cookies. Which element should be
     clicked to achieve that directly, or to open the settings if no direct
     reject exists?"
   - Když je v snapshotu ≥ 1 přepínač: per-přepínač `noul` „Is this toggle
     for a non-essential category (analytics/marketing/personalization)?"
     → vypnout vše, co je non-essential a `checked`; pak choice na tlačítko
     „Save/Confirm choices".
   - Confidence práh 0,55; pod ním → T2.
   - Timeout 2 500 ms, 1 retry, pak T2. Endpoint offline → cache
     „unreachable" na 60 s, aby se neblokovalo každé načtení.
3. **T2 Heuristika** (`src/engine/heuristics.ts`): skóruje texty prvků
   proti multijazyčným seznamům (reject: „odmítnout", „reject all", „alle
   ablehnen", „tout refuser", „rifiuta tutto", „rechazar todo", „odrzuć
   wszystkie", …; save: „uložit", „save", „speichern"…; manage: „nastavení",
   „manage", „einstellungen"…; accept: …). Negativní váhy pro „accept".
   Pro `custom` politiku mapuje kategorie na přepínače podle slov
   (analytics/statistik, marketing/reklama, personal…).

**PlanCache**: klíč `hostname + cmpHint + hash(elementTexts)`, hodnota =
plán + zdroj, TTL 30 dní. Druhá návštěva = žádná síť. Neúspěch (dialog po
provedení stále viditelný) → invalidace záznamu.

### 3.3 Nastavení (`chrome.storage.sync`)

```ts
interface Settings {
  enabled: boolean;                 // true
  policy: 'reject_all' | 'accept_all' | 'custom';   // 'reject_all'
  custom: { analytics: boolean; marketing: boolean;
            personalization: boolean; functional: boolean };
  openjev: { endpoint: string; token: string; enabled: boolean }; // localhost:3000
  confidenceThreshold: number;      // 0.55
  disabledHosts: string[];          // „tady nezasahuj"
  showBadge: boolean;               // true — badge ✓ / – na ikoně
}
```

### 3.4 UI

- **Popup**: stav pro aktuální tab (Vyřízeno / Nic nenalezeno / Vypnuto zde /
  Chyba), zdroj rozhodnutí (CMP pravidlo / OpenJev / heuristika), tlačítka
  „Spustit znovu", „Na tomto webu vypnout", odkaz na nastavení.
- **Options**: politika (radio), vlastní kategorie (checkboxy), OpenJev
  endpoint + token + „Otestovat spojení" (volá `/v1/version`), práh,
  seznam vypnutých webů, vymazat cache. Lokalizace cs + en přes
  `_locales`.

### 3.5 Oprávnění (minimální)

`storage`, `activeTab`, `scripting` (jen pro „Spustit znovu"),
`host_permissions: ["<all_urls>"]` (content script musí běžet všude — v
listingu zdůvodněno; zároveň pokrývá `fetch` na uživatelův OpenJev endpoint
ze service workeru).

## 4. Zpracování chyb

- OpenJev nedostupný / timeout / 401 / nevalidní JSON → T2, chyba se
  zobrazí jen v popupu a options (test spojení), nikdy neblokuje stránku.
- Dialog po plánu stále viditelný → 1 další kolo s vyloučením již
  kliknutých prvků; pak stav „nepodařilo se" + invalidace cache.
- Prvek zmizel mezi snapshotem a klikem → krok přeskočen, kolo se opakuje.
- Iframe bez přístupu (cross-origin bez content scriptu) → nic.
- Všechny výjimky v content scriptu chyceny; nikdy nesmí rozbít stránku.

## 5. Soukromí a store compliance

- Ven z prohlížeče jde **pouze** `DialogSnapshot` (texty prvků a text
  dialogu) a **pouze** na endpoint, který si uživatel nastavil. Výchozí
  je localhost. Žádné URL, žádné cookies, žádná telemetrie.
- `docs/PRIVACY.md` + `docs/store/` (listing EN/CS, zdůvodnění oprávnění,
  single-purpose statement) + `docs/PUBLISHING.md` (Chrome Web Store +
  Edge Partner Center krok za krokem).
- Žádný vzdálený kód (MV3): vše bundlované.
- Licence rozšíření: MIT. OpenJev váhy (`openjev/openjev`) jsou CC BY-NC 4.0
  — rozšíření je nekomerční a model provozuje uživatel sám; alternativa
  Open-Jev 2B/9B (MIT kód). Uvedeno v README.

## 6. Stack a struktura

- TypeScript (strict), esbuild bundling (`scripts/build.mjs`), bez frameworku
  v UI (vanilla TS + malé CSS), Vitest + jsdom pro jednotkové testy,
  Playwright pro e2e (nahraje rozbalené rozšíření do Chromia a otevře
  lokální fixture stránky s falešnými bannery), ESLint + `tsc --noEmit`.
- GitHub Actions: lint + test + build + zip artefakt.

```
zJev/
  src/
    manifest.json
    shared/   types.ts, settings.ts, messages.ts, keywords.ts
    engine/   cmp-rules.ts, heuristics.ts, openjev-client.ts,
              decision-engine.ts, plan-cache.ts
    content/  index.ts, detector.ts, snapshot.ts, executor.ts
    background/ index.ts
    popup/    popup.html, popup.ts, popup.css
    options/  options.html, options.ts, options.css
    _locales/ en/messages.json, cs/messages.json
    icons/
  tests/      unit (vitest), e2e (playwright), fixtures/*.html
  docs/       PRIVACY.md, PUBLISHING.md, store/, superpowers/specs/
  scripts/    build.mjs, zip.mjs, gen-icons.mjs
```

## 7. Testování

- Unit: detector na fixture DOM (jsdom), heuristika (cs/en/de/fr/it/es/pl
  vzorky, ověření že „Accept all" nikdy nevyhraje při `reject_all`),
  OpenJev client (mock fetch: happy path, timeout, 401, low confidence →
  fallback), decision-engine tiering, plan-cache TTL/invalidace, executor
  (klik, toggle, missing element).
- E2E (Playwright, Chromium s `--load-extension`): 4 fixture stránky —
  generický banner s „Reject all"; banner jen s „Accept / Settings" →
  settings s přepínači → Save; OneTrust-like markup; stránka bez banneru
  (nesmí nic kliknout). OpenJev mock server v testu (Node http) vrací
  deterministické odpovědi; druhý běh s vypnutým mockem ověří fallback.

## 8. Rozhodnutí (ADR ve zkratce)

- **OpenJev přes HTTP, ne in-browser**: model neexistuje v ONNX/WebGPU; 2B by
  i tak znamenal stovky MB v rozšíření, což store nepřijme rozumně.
- **Tři vrstvy rozhodování**: T0 kvůli rychlosti na 80 % webů, T1 pro
  dlouhý ocas, T2 aby rozšíření nikdy „nedělalo nic" bez serveru.
- **Výchozí politika reject_all**: odpovídá zadání („všechno povypínat").
- **Bez frameworku v UI**: dvě malé stránky, framework nepřidá hodnotu.
