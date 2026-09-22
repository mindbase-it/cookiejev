# Store listing (EN)

**Name:** CookieJev – cookie consent autopilot

**Short description (≤132 chars):**
Automatically rejects (or configures) cookie consent dialogs on EU websites. Free, open source, no tracking.

**Detailed description:**

Tired of clicking "Reject all" on every website? CookieJev does it for you.

CookieJev detects cookie consent dialogs (GDPR / ePrivacy banners) and handles them according to the policy you choose:

• Reject all non‑essential cookies (default) – analytics, marketing, personalization and functional cookies are switched off, only strictly necessary ones remain.
• Custom – pick exactly which categories you allow.
• Accept all – if you just want the banner gone.

How it decides what to click
1. Built‑in rules for the most common consent platforms (OneTrust, Cookiebot, Usercentrics, Didomi, Quantcast, Sourcepoint, Klaro, CookieYes, tarteaucitron, Osano, Complianz, iubenda, Civic, TrustArc, Termly, consentmanager, Borlabs and more).
2. OpenJev – an open‑weights decision model that reads the dialog and picks the right button, even on sites nobody has written a rule for. OpenJev runs on your own computer or server; you set the endpoint in Settings. It is optional.
3. Keyword heuristics in 20+ EU languages as a safety net when OpenJev is not available.

When a banner only offers "Accept" and "Settings", CookieJev opens the settings, switches the categories off and saves – a real refusal, not just hiding the banner.

Privacy
• No account, no telemetry, no ads.
• Nothing is sent to the extension authors. The only network request the extension can make is to the OpenJev endpoint you configure yourself, and it contains only the text of the consent dialog – never the page URL or cookies.
• Open source (MIT): https://github.com/mindbase-it/cookiejev

Works in Google Chrome and Microsoft Edge.
