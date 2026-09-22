# CookieJev

Free Chrome / Edge extension (Manifest V3) that detects cookie consent dialogs on EU websites and handles them according to your policy — by default **rejecting all non‑essential cookies**. Decisions come from a three‑tier engine: built‑in rules for known consent platforms, the **OpenJev** decision model, and multilingual keyword heuristics as a safety net.

- Store listing texts: [`docs/store/`](docs/store/) · Privacy policy: [`docs/PRIVACY.md`](docs/PRIVACY.md) · Publishing guide: [`docs/PUBLISHING.md`](docs/PUBLISHING.md)
- Design spec: [`docs/superpowers/specs/2026-09-22-cookiejev-design.md`](docs/superpowers/specs/2026-09-22-cookiejev-design.md)

## How it works

```
content script (every frame)            background service worker
────────────────────────────            ──────────────────────────────────────────
detect dialog ──► snapshot ──message──► DecisionEngine
                                          1. PlanCache (hostname + dialog shape)
                                          2. CMP rules (OneTrust, Cookiebot, …)
                                          3. OpenJev  POST /v1/systemone  (optional)
                                          4. heuristics (20+ EU languages)
execute plan ◄──────────────────────────  ActionPlan { click / setToggle … }
(≤ 3 rounds: banner → settings → save)
```

The **snapshot** sent to the engine contains only the dialog text and the labels/ids/classes of its interactive elements — never the page URL, cookies or other page content. OpenJev is asked typed questions (`choice` / `noul`):

| question | type | meaning |
|---|---|---|
| `is_consent` | noul | is this really a cookie/consent dialog? (unknown CMPs only) |
| `reject_button` | choice over element keys + `none` | one‑click reject |
| `manage_button` | choice | opens detailed settings |
| `save_button` | choice | saves the current selection (when toggles exist) |
| `toggle_<key>` | choice over categories | which category a toggle controls |

Answers below the configurable confidence threshold fall through to the heuristics. OpenJev outages back off for 60 s and never block the page.

## Running OpenJev

OpenJev is a server‑side model; the extension talks to whatever endpoint you configure (default `http://127.0.0.1:3000`).

```bash
pip install "vllm==0.29.0" "openai==3.16.2" "httpx==0.28.1"
hf download openjev/openjev --local-dir openjev
vllm serve ./openjev --host 127.0.0.1 --served-model-name qwen --port 8000 \
  --enable-prefix-caching --max-model-len 16384 --quantization fp8
VLLM=http://localhost:8000/v1 python openjev/helper/shim.py --port 3000
```

Smaller alternative with MIT code: [Open‑Jev 2B/9B](https://github.com/Zefan-Cai/Open-Jev). Any server implementing `POST /v1/systemone` (+ `GET /v1/version` for the connection test) works. Note the `openjev/openjev` weights are CC BY‑NC 4.0.

## Development

```bash
npm ci
npm run build          # → dist/  (load unpacked in chrome://extensions or edge://extensions)
npm test               # unit tests (vitest + jsdom)
npm run test:e2e       # Playwright: loads dist/ into Chromium, fixture pages + OpenJev mock
npm run verify         # lint + typecheck + unit + build + e2e
npm run zip            # release/cookiejev-<version>.zip
```

Layout:

```
src/
  manifest.json
  shared/     types, settings (storage.sync), messages, keywords (EU vocab), i18n
  engine/     cmp-rules, heuristics, openjev-client, openjev-decider, plan-cache, decision-engine
  content/    detector, snapshot, executor, index (orchestration, ≤3 rounds)
  background/ service worker: messaging, badge, tab status
  popup/ options/ _locales/{en,cs} icons/
tests/unit    engine + settings
tests/e2e     fixtures (generic, settings flow, OneTrust‑like, novel wording, non‑consent modal), OpenJev mock
```

Adding a consent platform: append a `CmpRule` in `src/engine/cmp-rules.ts` (container selectors + element matchers by id/class/label) and a unit test.

## License

MIT © 2026 MindBase s.r.o.
