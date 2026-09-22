/**
 * Multilingual vocabulary for consent dialogs (EU languages). All entries lowercase,
 * diacritics kept; matching normalizes both sides via `normalize()`.
 */

/** Words indicating the dialog is about cookies / tracking consent. */
export const CONSENT_TOPIC_WORDS: string[] = [
  'cookie', 'cookies', 'consent', 'gdpr', 'tracking', 'privacy',
  'souhlas', 'soubory cookie', 'sledování', 'soukromí',
  'súhlas', 'súkromie',
  'zustimmung', 'einwilligung', 'datenschutz',
  'consentement', 'confidentialité', 'traceurs',
  'consenso', 'privacy',
  'consentimiento', 'privacidad',
  'consentimento', 'privacidade',
  'zgoda', 'ciasteczka', 'pliki cookie', 'prywatność',
  'toestemming', 'privacy',
  'samtycke', 'integritet',
  'samtykke', 'personvern', 'privatliv',
  'suostumus', 'evästeet', 'evästeitä', 'tietosuoja',
  'hozzájárulás', 'sütik', 'adatvédelem',
  'consimțământ', 'confidențialitate',
  'συγκατάθεση', 'απόρρητο',
  'sutikimas', 'slapukai', 'piekrišana', 'sīkdatnes', 'nõusolek', 'küpsised',
  'privatnost', 'kolačići', 'piškotki', 'soglasje', 'бисквитки', 'съгласие',
  // Stems for inflected languages (matched as word prefixes by hasTopicWord).
  'zgod', 'ciastecz', 'prywatno', 'sledov', 'soukrom', 'sukrom', 'zustimm', 'einwillig', 'consent', 'confidential',
  'privac', 'consens', 'toestemm', 'samtyck', 'samtykk', 'suostum', 'evaste', 'hozzajarul', 'sutik', 'consimt',
  'sutikim', 'slapuk', 'piekris', 'sikdatn', 'nousolek', 'kupsis', 'kolacic', 'piskotk', 'soglasj', 'biskvitk', 'saglasi',
];

/** Phrases meaning "reject / decline all (non-essential)". Higher weight for "all" variants. */
export const REJECT_PHRASES: string[] = [
  'reject all', 'reject', 'decline all', 'decline', 'refuse all', 'refuse', 'deny all', 'deny',
  'only necessary', 'only essential', 'necessary only', 'essential only', 'strictly necessary',
  'continue without accepting', 'continue without agreeing', 'disagree', 'do not accept', 'not accept',
  'use necessary cookies only', 'no thanks', 'no, thanks',
  'odmítnout vše', 'odmítnout', 'zamítnout vše', 'zamítnout', 'pouze nezbytné', 'jen nezbytné', 'nesouhlasím', 'pouze nutné',
  'odmietnuť všetko', 'odmietnuť', 'len nevyhnutné', 'nesúhlasím',
  'alle ablehnen', 'ablehnen', 'nur notwendige', 'nur erforderliche', 'nur essenzielle', 'ohne zustimmung fortfahren', 'nicht akzeptieren', 'verweigern',
  'tout refuser', 'refuser', 'continuer sans accepter', 'uniquement les cookies nécessaires', 'refuser tout',
  'rifiuta tutto', 'rifiuta', 'rifiuto', 'solo necessari', 'continua senza accettare', 'non accetto',
  'rechazar todo', 'rechazar', 'rechazar todas', 'solo necesarias', 'continuar sin aceptar', 'no acepto',
  'rejeitar tudo', 'rejeitar', 'recusar tudo', 'recusar', 'apenas necessários',
  'odrzuć wszystkie', 'odrzuć wszystko', 'odrzuć', 'odrzucam', 'nie zgadzam się', 'nie wyrażam zgody', 'nie akceptuję', 'tylko niezbędne', 'odmów',
  'alles weigeren', 'weigeren', 'alleen noodzakelijk', 'alleen noodzakelijke', 'niet akkoord', 'afwijzen',
  'avvisa alla', 'avvisa', 'neka alla', 'neka', 'endast nödvändiga',
  'avvis alle', 'avvis', 'kun nødvendige',
  'afvis alle', 'afvis', 'kun nødvendige',
  'hylkää kaikki', 'hylkää', 'vain välttämättömät',
  'összes elutasítása', 'elutasítás', 'elutasítom', 'csak a szükséges',
  'respinge tot', 'respinge', 'refuză toate', 'doar necesare',
  'απόρριψη όλων', 'απόρριψη',
  'atmesti visus', 'atmesti', 'noraidīt visu', 'noraidīt', 'keeldu kõigist', 'keeldu',
  'odbij sve', 'odbij', 'zavrni vse', 'zavrni', 'отхвърли всички', 'отхвърляне',
];

/** Phrases meaning "save / confirm my choices" (used after toggles are set). */
export const SAVE_PHRASES: string[] = [
  'save', 'save settings', 'save preferences', 'save choices', 'save my choices', 'confirm', 'confirm my choices',
  'confirm choices', 'confirm selection', 'save and exit', 'save and close', 'apply', 'submit', 'done', 'save & exit',
  'allow selection', 'allow selected', 'accept selected', 'accept selection', 'use selection',
  'uložit', 'uložit nastavení', 'uložit volby', 'potvrdit', 'potvrdit výběr', 'povolit výběr', 'uložit a zavřít',
  'uložiť', 'potvrdiť', 'povoliť výber',
  'speichern', 'auswahl speichern', 'einstellungen speichern', 'auswahl bestätigen', 'bestätigen', 'auswahl erlauben', 'übernehmen',
  'enregistrer', 'sauvegarder', 'confirmer', 'confirmer mes choix', 'valider', 'enregistrer et fermer', 'autoriser la sélection',
  'salva', 'salva le preferenze', 'conferma', 'conferma le mie scelte', 'salva e chiudi', 'consenti selezione',
  'guardar', 'guardar preferencias', 'confirmar', 'confirmar mis opciones', 'guardar y salir', 'permitir selección',
  'guardar', 'salvar', 'confirmar', 'gravar', 'permitir seleção',
  'zapisz', 'zapisz ustawienia', 'potwierdź', 'potwierdź wybór', 'zapisz i zamknij', 'zezwól na wybrane',
  'opslaan', 'bevestigen', 'voorkeuren opslaan', 'selectie toestaan', 'keuze bevestigen',
  'spara', 'bekräfta', 'spara inställningar', 'tillåt urval',
  'lagre', 'bekreft', 'gem', 'bekræft', 'tallenna', 'vahvista', 'salli valinta',
  'mentés', 'megerősítés', 'beállítások mentése', 'salvează', 'confirmă',
  'αποθήκευση', 'επιβεβαίωση', 'išsaugoti', 'patvirtinti', 'saglabāt', 'apstiprināt', 'salvesta', 'kinnita',
  'spremi', 'potvrdi', 'shrani', 'potrdi', 'запази', 'потвърди',
];

/** Phrases meaning "open settings / manage / customize". */
export const MANAGE_PHRASES: string[] = [
  'manage', 'manage settings', 'manage cookies', 'manage preferences', 'manage options', 'settings', 'cookie settings',
  'customize', 'customise', 'preferences', 'options', 'more options', 'more information', 'learn more and customize',
  'configure', 'let me choose', 'choose', 'personalize', 'personalise', 'adjust', 'show purposes', 'purposes',
  'nastavení', 'nastavení cookies', 'spravovat', 'upravit', 'přizpůsobit', 'možnosti', 'podrobné nastavení', 'více možností',
  'nastavenia', 'spravovať', 'prispôsobiť',
  'einstellungen', 'anpassen', 'verwalten', 'cookie-einstellungen', 'mehr optionen', 'optionen', 'individuelle einstellungen',
  'paramétrer', 'paramètres', 'personnaliser', 'gérer', 'gérer mes choix', 'plus d\'options', 'configurer',
  'impostazioni', 'personalizza', 'gestisci', 'gestisci le preferenze', 'più opzioni', 'configura',
  'configurar', 'personalizar', 'gestionar', 'ajustes', 'más opciones', 'administrar',
  'definições', 'preferências', 'personalizar', 'gerir',
  'ustawienia', 'dostosuj', 'zarządzaj', 'zarządzaj ustawieniami', 'więcej opcji', 'opcje',
  'instellingen', 'aanpassen', 'beheren', 'voorkeuren', 'meer opties',
  'inställningar', 'anpassa', 'hantera', 'innstillinger', 'tilpass', 'administrer', 'indstillinger', 'tilpas',
  'asetukset', 'mukauta', 'hallitse', 'beállítások', 'testreszabás', 'setări', 'personalizează',
  'ρυθμίσεις', 'προσαρμογή', 'nustatymai', 'iestatījumi', 'seaded', 'postavke', 'nastavitve', 'настройки',
];

/** Phrases meaning "accept all / agree". Strongly negative for reject policies. */
export const ACCEPT_PHRASES: string[] = [
  'accept all', 'accept', 'agree', 'i agree', 'allow all', 'allow', 'ok', 'okay', 'got it', 'i understand', 'understood',
  'yes', 'continue', 'consent', 'agree and close', 'accept and continue', 'accept cookies', 'enable all', 'allow cookies',
  'přijmout vše', 'přijmout', 'souhlasím', 'povolit vše', 'povolit', 'rozumím', 'ano', 'pokračovat', 'přijmout cookies',
  'prijať všetko', 'prijať', 'súhlasím', 'povoliť všetko', 'rozumiem',
  'alle akzeptieren', 'akzeptieren', 'zustimmen', 'einverstanden', 'alle zulassen', 'zulassen', 'verstanden', 'ja', 'alles akzeptieren', 'annehmen',
  'tout accepter', 'accepter', 'j\'accepte', 'autoriser', 'tout autoriser', 'd\'accord', 'oui', 'continuer', 'accepter et fermer',
  'accetta tutto', 'accetta', 'accetto', 'acconsento', 'consenti tutti', 'ho capito', 'sì', 'continua', 'accetta e chiudi',
  'aceptar todo', 'aceptar', 'acepto', 'permitir todo', 'permitir', 'entendido', 'sí', 'continuar', 'aceptar todas',
  'aceitar tudo', 'aceitar', 'aceito', 'permitir todos', 'concordo', 'entendi',
  'akceptuj wszystkie', 'akceptuj', 'akceptuję', 'zgadzam się', 'zezwól na wszystkie', 'zezwól', 'rozumiem', 'tak', 'przejdź do serwisu',
  'alles accepteren', 'accepteren', 'akkoord', 'alles toestaan', 'toestaan', 'begrepen', 'ja', 'ik ga akkoord',
  'acceptera alla', 'acceptera', 'godkänn alla', 'godkänn', 'tillåt alla', 'jag förstår', 'ok',
  'godta alle', 'godta', 'aksepter alle', 'aksepter', 'tillat alle', 'accepter alle', 'acceptér', 'tillad alle',
  'hyväksy kaikki', 'hyväksy', 'salli kaikki', 'ymmärrän',
  'összes elfogadása', 'elfogadom', 'elfogad', 'engedélyez', 'acceptă tot', 'acceptă', 'accept', 'sunt de acord',
  'αποδοχή όλων', 'αποδοχή', 'συμφωνώ', 'sutinku', 'priimti visus', 'piekrītu', 'pieņemt visu', 'nõustun', 'luba kõik',
  'prihvati sve', 'prihvaćam', 'sprejmi vse', 'sprejmem', 'приемам всички', 'приемам', 'разбирам',
];

export interface CategoryWords {
  necessary: string[];
  analytics: string[];
  marketing: string[];
  personalization: string[];
  functional: string[];
}

/** Words used to classify a toggle/checkbox label into a consent category. */
export const CATEGORY_WORDS: CategoryWords = {
  necessary: [
    'necessary', 'essential', 'strictly', 'required', 'technical', 'technically',
    'nezbytné', 'nutné', 'technické', 'nevyhnutné', 'notwendig', 'erforderlich', 'technisch', 'essenziell',
    'nécessaire', 'essentiel', 'technique', 'necessari', 'essenziali', 'tecnici', 'necesarias', 'esenciales', 'técnicas',
    'necessários', 'essenciais', 'niezbędne', 'wymagane', 'techniczne', 'noodzakelijk', 'essentieel', 'nödvändiga',
    'nødvendige', 'välttämättömät', 'szükséges', 'necesare', 'απαραίτητα', 'būtini', 'nepieciešamās', 'vajalikud', 'nujni', 'nužni', 'необходими',
  ],
  analytics: [
    'analytics', 'analytical', 'statistics', 'statistical', 'performance', 'measurement', 'measure', 'audience',
    'analytické', 'analytika', 'statistické', 'statistika', 'výkon', 'měření', 'analytics', 'štatistické',
    'analyse', 'analytisch', 'statistik', 'statistiken', 'leistung', 'messung',
    'analytique', 'analytiques', 'statistiques', 'mesure', 'audience',
    'analitici', 'statistici', 'statistiche', 'prestazioni', 'misurazione',
    'analíticas', 'analítica', 'estadísticas', 'rendimiento', 'medición',
    'analíticos', 'estatísticas', 'desempenho',
    'analityczne', 'statystyczne', 'statystyki', 'wydajność', 'pomiar',
    'analytisch', 'statistieken', 'prestaties', 'analys', 'statistik', 'prestanda',
    'analyyttiset', 'tilastolliset', 'tilastot', 'analitikai', 'statisztikai', 'analitice', 'statistice',
    'στατιστικά', 'ανάλυση', 'analitiniai', 'statistika', 'analītika', 'statistikas', 'analüütika', 'statistika',
    'analitički', 'statistički', 'analitični', 'аналитични', 'статистически',
  ],
  marketing: [
    'marketing', 'advertising', 'advertisement', 'ads', 'ad', 'targeting', 'targeted', 'social media', 'social', 'retargeting', 'remarketing', 'sponsored', 'promotional',
    'marketingové', 'reklamní', 'reklama', 'cílení', 'cílené', 'sociální', 'reklamné', 'cielené',
    'werbung', 'werbe', 'marketing', 'zielgruppen', 'soziale medien', 'personalisierte werbung',
    'publicité', 'publicitaires', 'ciblage', 'ciblée', 'réseaux sociaux',
    'pubblicità', 'pubblicitari', 'targeting', 'social',
    'publicidad', 'publicitarias', 'segmentación', 'redes sociales',
    'publicidade', 'anúncios', 'segmentação',
    'reklamowe', 'reklamy', 'marketingowe', 'targetowanie', 'media społecznościowe',
    'advertenties', 'advertentie', 'sociale media', 'annonser', 'reklam', 'annonsering', 'markedsføring', 'mainonta', 'mainokset',
    'hirdetés', 'hirdetések', 'publicitate', 'διαφήμιση', 'διαφημιστικά', 'reklaminiai', 'reklāma', 'reklaam', 'oglaševanje', 'oglašavanje', 'реклама', 'маркетинг',
  ],
  personalization: [
    'personalization', 'personalisation', 'personalized', 'personalised', 'preferences', 'profiling', 'profile', 'content selection', 'personalised content',
    'personalizace', 'personalizované', 'profilování', 'preference', 'personalizácia',
    'personalisierung', 'personalisiert', 'profilbildung', 'präferenzen',
    'personnalisation', 'personnalisé', 'profilage', 'préférences',
    'personalizzazione', 'personalizzati', 'profilazione', 'preferenze',
    'personalización', 'personalizado', 'perfilado', 'preferencias',
    'personalização', 'personalizado', 'perfilagem',
    'personalizacja', 'spersonalizowane', 'profilowanie', 'preferencje',
    'personalisatie', 'gepersonaliseerd', 'profilering', 'voorkeuren', 'personalisering', 'anpassning', 'personointi', 'profilointi',
    'személyre szabás', 'personalizare', 'εξατομίκευση', 'personalizavimas', 'personalizācija', 'isikupärastamine', 'personalizacija', 'персонализация',
  ],
  functional: [
    'functional', 'functionality', 'preference', 'convenience', 'comfort', 'experience', 'embedded', 'video', 'chat', 'external media',
    'funkční', 'funkcionalita', 'funkčné', 'komfort', 'funktional', 'funktionell', 'komfort', 'externe medien',
    'fonctionnel', 'fonctionnels', 'fonctionnalité', 'funzionali', 'funzionalità', 'funcionales', 'funcionalidad',
    'funcionais', 'funcjonalne', 'funkcjonalność', 'functioneel', 'functionele', 'funktionella', 'funksjonelle', 'funktionelle', 'toiminnalliset',
    'funkcionális', 'funcționale', 'λειτουργικά', 'funkciniai', 'funkcionālās', 'funktsionaalsed', 'funkcionalni', 'функционални',
  ],
};

let topicNormalized: string[] | null = null;

/**
 * True when the text mentions cookies/consent in some EU language. Single-word topics match as
 * word prefixes ("zgody" <- "zgoda", "cookies" <- "cookie", "souhlasím" <- "souhlas"); multi-word
 * topics must appear as a whole phrase.
 */
export function hasTopicWord(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  topicNormalized ??= CONSENT_TOPIC_WORDS.map((w) => normalize(w));
  const padded = ` ${t} `;
  const words = t.split(' ');
  for (const w of topicNormalized) {
    if (!w) continue;
    if (w.includes(' ')) {
      if (padded.includes(` ${w} `)) return true;
    } else if (words.some((x) => x.startsWith(w))) {
      return true;
    }
  }
  return false;
}

/** Lowercases, strips diacritics and collapses whitespace/punctuation for robust matching. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
