# Store listing (CS)

**Název:** CookieJev – autopilot pro cookie lišty

**Krátký popis (≤132 znaků):**
Automaticky odmítne (nebo nastaví) cookie dialogy na webech v EU. Zdarma, open source, bez sledování.

**Podrobný popis:**

Nebaví vás na každém webu klikat „Odmítnout vše“? CookieJev to udělá za vás.

CookieJev rozpozná dialogy o souhlasu s cookies (GDPR / ePrivacy lišty) a vyřídí je podle politiky, kterou si zvolíte:

• Odmítnout vše kromě nezbytných (výchozí) – analytické, marketingové, personalizační i funkční cookies se vypnou, zůstanou jen nezbytně nutné.
• Vlastní – vyberete přesně, které kategorie povolíte.
• Přijmout vše – když chcete mít lištu prostě pryč.

Jak se rozhoduje, na co kliknout
1. Vestavěná pravidla pro nejrozšířenější consent platformy (OneTrust, Cookiebot, Usercentrics, Didomi, Quantcast, Sourcepoint, Klaro, CookieYes, tarteaucitron, Osano, Complianz, iubenda, Civic, TrustArc, Termly, consentmanager, Borlabs a další).
2. OpenJev – open‑weights rozhodovací model, který si dialog přečte a vybere správné tlačítko i na webu, pro který nikdo pravidlo nenapsal. OpenJev běží na vašem počítači nebo serveru; endpoint nastavíte v Nastavení. Je volitelný.
3. Heuristika podle klíčových slov ve 20+ jazycích EU jako záchranná síť, když OpenJev není dostupný.

Když lišta nabízí jen „Přijmout“ a „Nastavení“, CookieJev nastavení otevře, kategorie vypne a uloží – skutečné odmítnutí, ne jen schování lišty.

Soukromí
• Žádný účet, žádná telemetrie, žádné reklamy.
• Autorům rozšíření se neposílá nic. Jediný síťový požadavek, který rozšíření může udělat, míří na OpenJev endpoint, který si sami nastavíte, a obsahuje jen text cookie dialogu – nikdy URL stránky ani cookies.
• Open source (MIT): https://github.com/mindbase-it/cookiejev

Funguje v Google Chrome i Microsoft Edge.
