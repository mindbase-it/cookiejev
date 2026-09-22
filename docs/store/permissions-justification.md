# Permission justifications (copy into the store forms)

**Single purpose description**
CookieJev automatically handles cookie consent dialogs on websites according to the user's chosen policy (reject all non‑essential cookies, custom categories, or accept all).

**Host permission (`<all_urls>` / all http and https sites)**
Cookie consent dialogs can appear on any website. The content script must run on every page to detect a consent dialog and act on it. It only interacts with elements inside a detected consent dialog and never modifies other page content. The same host access lets the background worker contact the OpenJev decision endpoint the user configures (default: localhost).

**storage**
Persists user settings (policy, endpoint, paused sites) in sync storage and a small cache of successful action plans per website in local storage so repeated visits are handled instantly.

**activeTab**
Lets the popup's "Run again" button operate on the tab the user is currently viewing.

**scripting**
Used only by "Run again" to inject the content script into a tab that was opened before the extension was installed or enabled.

**Remote code**
None. All code is bundled in the package. The OpenJev endpoint returns JSON data (probabilities), never code.

**Data usage**
Website content: the visible text and button labels of a detected cookie consent dialog are processed locally and, if the user enabled it, sent to the OpenJev endpoint the user configured. No personal data, no page URLs, no cookies. Not sold, not shared with third parties by the developer, not used for anything except the single purpose.
