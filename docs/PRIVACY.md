# CookieJev – Privacy Policy

_Last updated: 2026-09-22_

CookieJev is a free browser extension for Chrome and Microsoft Edge that automatically handles cookie consent dialogs according to the preferences you choose. This document explains what data the extension touches and where it goes.

## Summary

- CookieJev **does not collect, store or transmit any personal data to the extension authors**.
- There is **no analytics, no telemetry, no crash reporting** and no account.
- The extension has **no server of its own**. The only network requests it can make are to the OpenJev decision endpoint that **you** configure (by default `http://127.0.0.1:3000`, i.e. your own computer). You can disable this entirely in Settings.

## What the extension reads on web pages

To find and handle a consent dialog, the content script inspects the page DOM for visible dialog-like containers that mention cookies / consent in one of the EU languages. For such a dialog it builds a **snapshot** that contains only:

- the visible text of the dialog (truncated to 1 500 characters),
- the labels, roles, ids and CSS classes of the interactive elements inside the dialog (buttons, links, checkboxes, switches),
- the document language and a hint about the consent platform, if recognised.

The snapshot never contains the page URL, the page title, cookies, form values, or any page content outside the consent dialog.

## Where the snapshot goes

1. **Inside the browser** – the snapshot is passed to the extension's background service worker, which applies built‑in rules and keyword heuristics. Nothing leaves the browser in this step.
2. **To your OpenJev endpoint (optional)** – if OpenJev is enabled in Settings and neither a built‑in rule nor cached plan applies, the snapshot text is sent with an HTTPS/HTTP `POST` to the endpoint URL you configured. The authors of CookieJev do not operate this endpoint and never see this data. If you point the endpoint at a third‑party server, that server's privacy policy applies to the snapshot text.

## What is stored locally

- **Settings** (`chrome.storage.sync`): your policy (reject all / accept all / custom categories), OpenJev endpoint and optional token, paused sites, UI preferences. Chrome/Edge may sync these with your browser profile according to your browser settings.
- **Decision cache** (`chrome.storage.local`): for each hostname + dialog shape, the action plan that worked (which button to click / which toggles to switch), so repeated visits are handled instantly without any network call. Entries expire after 30 days and can be cleared in Settings.
- **Per‑tab status** (`chrome.storage.session`): whether the dialog on the current tab was handled; cleared when the tab navigates or closes.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save settings and the decision cache. |
| `activeTab`, `scripting` | The "Run again" button in the popup re‑injects the content script into the current tab. |
| Host access to all `http`/`https` sites | Consent dialogs can appear on any website, so the content script must be able to run everywhere. It only acts when a consent dialog is detected. Host access is also what allows the background worker to reach the OpenJev endpoint you configure. |

## Limited Use disclosure

CookieJev's use of information received from browser APIs complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use), including the Limited Use requirements. Data is used solely to provide the extension's single purpose: handling cookie consent dialogs according to your preferences.

## Contact

Questions about this policy: open an issue at <https://github.com/mindbase-it/cookiejev/issues>.
