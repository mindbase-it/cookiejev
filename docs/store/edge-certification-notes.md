# Notes for certification (Edge Add-ons / Chrome Web Store reviewer)

CookieJev automatically handles cookie consent dialogs according to the user's policy
(default: reject all non-essential cookies).

How to test
1. Install the extension. Open any EU website with a cookie banner, e.g. https://www.bbc.com/,
   https://www.lemonde.fr/ or https://www.seznam.cz/. The banner is dismissed by clicking its
   "Reject all" / "Only necessary" control, or by opening its settings, switching non-essential
   categories off and saving.
2. Click the toolbar icon: the popup shows whether a dialog was handled and which decision
   source was used (built-in rule, OpenJev, heuristic, cache).
3. Settings page: change the policy to "Accept all" or "Custom" and reload a site.

OpenJev (optional decision model)
- The extension can consult an OpenJev decision model over HTTP. This is OPTIONAL and OFF by
  default in practice, because the default endpoint is http://127.0.0.1:3000 (the user's own
  machine); when nothing listens there the extension silently falls back to built-in rules and
  keyword heuristics. No server operated by the developer is involved.
- Only the text and button labels of the detected consent dialog are sent to the endpoint the
  user configured. Never the page URL, cookies, form data or other page content.

Permissions
- storage: settings and a per-site cache of successful action plans.
- activeTab + scripting: the "Run again" button in the popup re-injects the content script.
- Host access to all http/https sites: consent dialogs can appear on any site; the content
  script only acts inside a detected consent dialog.

No remote code, no analytics, no accounts, no ads. Source: https://github.com/mindbase-it/cookiejev
Privacy policy: https://github.com/mindbase-it/cookiejev/blob/main/docs/PRIVACY.md
Support: https://github.com/mindbase-it/cookiejev/issues
