# Publikace do Chrome Web Store a Microsoft Edge Add-ons

Jeden build (`dist/`, Manifest V3) slouží pro oba obchody. Balíček vytvoříš:

```bash
npm ci
npm run verify        # lint + typecheck + unit + build + e2e
npm run zip           # release/cookiejev-<version>.zip
```

Verze se bere z `package.json` (`npm version patch|minor|major` ji zvedne a udělá tag).

## Co je hotové v repu

- `release/cookiejev-<version>.zip` – balíček k nahrání
- `docs/PRIVACY.md` – privacy policy (oba obchody vyžadují veřejnou URL; po pushi na GitHub je to `https://github.com/mindbase-it/cookiejev/blob/main/docs/PRIVACY.md`, lépe GitHub Pages)
- `docs/store/listing.en.md`, `docs/store/listing.cs.md` – texty pro listing
- `docs/store/permissions-justification.md` – zdůvodnění oprávnění (copy‑paste do formuláře)
- `src/icons/icon128.png` – ikona obchodu (128×128)
- screenshoty: vytvoř 1280×800 PNG z popupu, options a z vyřízeného dialogu (`docs/store/screenshots/` – zatím prázdné, obchody vyžadují min. 1)

## Chrome Web Store

1. Založ vývojářský účet na <https://chrome.google.com/webstore/devconsole> (jednorázový poplatek 5 USD). Pro firemní publikaci použij Google Workspace účet MindBase a přidej ho do „Publisher“ skupiny.
2. **New item → Upload** `release/cookiejev-<version>.zip`.
3. **Store listing**: název, krátký popis a detailní popis z `docs/store/listing.en.md` (přidej i češtinu přes „Add language“ → `listing.cs.md`), kategorie *Productivity* (alternativně *Privacy & Security*), ikona 128 px, min. 1 screenshot 1280×800, odkaz na privacy policy.
4. **Privacy practices**:
   - Single purpose: „Automatically handles cookie consent dialogs according to the user's preferences.“
   - Permission justifications: z `docs/store/permissions-justification.md`.
   - Data usage: zaškrtni pouze *Website content* (text consent dialogu) → účel „App functionality“; potvrď „Not being sold to third parties“, „Not used for purposes unrelated to the core functionality“, „Not used for creditworthiness“.
   - Remote code: **No**.
5. **Distribution**: Public, všechny regiony (rozšíření dává smysl hlavně v EU/EHP/UK/CH, ale není důvod omezovat), Free.
6. Submit for review. Kontrola trvá typicky 1–3 dny; `<all_urls>` host permission může přidat ruční review (proto je zdůvodnění důležité).

## Microsoft Edge Add-ons

1. Partner Center: <https://partner.microsoft.com/dashboard/microsoftedge/> (registrace zdarma, potřeba Microsoft účet; pro firmu MindBase použij tenant účet).
2. **Create new extension → Upload** stejný zip.
3. **Properties**: kategorie *Productivity*, privacy policy URL, support URL (GitHub issues), licence MIT.
4. **Store listing** (EN + CS): texty z `docs/store/listing.*.md`, logo 300×300 (vygeneruj z `icon128.png` upscalem nebo přidej `scripts/gen-icons.mjs` velikost 300 — už umí libovolnou velikost), screenshot 1280×800 nebo 640×480.
5. **Availability**: Public, všechny trhy, Free.
6. Submit. Certifikace trvá obvykle do 7 dnů.

## Automatické publikování (volitelné, po prvním ručním zveřejnění)

- Chrome: Chrome Web Store API (OAuth client + refresh token) – akce `mnao305/chrome-extension-upload` v GitHub Actions.
- Edge: Edge Add-ons API (client id/secret/access token URL) – akce `wdzeng/edge-addon`.

Secrets ulož v GitHub repu (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`, `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_CLIENT_SECRET`, `EDGE_ACCESS_TOKEN_URL`) a odkomentuj job `publish` v `.github/workflows/ci.yml`.

## Poznámky k OpenJev a licenci

- Rozšíření samo je MIT. Model `openjev/openjev` je CC BY‑NC 4.0 – provozuje ho uživatel na vlastním HW pro nekomerční použití; rozšíření je zdarma a model nedistribuuje. Alternativa s MIT kódem: Open‑Jev 2B/9B (`ZefanCai/Open-Jev-*`).
- V listingu nepoužívej jména „Google“, „Microsoft“ ani loga CMP platforem – porušilo by to pravidla o brandingu.
