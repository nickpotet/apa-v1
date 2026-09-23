// Static venue config used by React components.
// Source of truth lives in /config/gallery_faq.json — keep in sync.

import type { Language } from '../voice/providers/VoiceProvider';

export const VENUE_NAME = 'CGGallery, Antarctica';
export const QR_URL = 'https://cggalleries.com';

// 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
// Long days (Thu–Mon): 10:30–14:00, 16:00–20:30
// Short days (Tue–Wed): 10:00–14:00, 15:00–19:00
export const LONG_DAYS = new Set([0, 1, 4, 5, 6]);

export type DaySchedule = {
  mOpen: string; mClose: string;
  aOpen: string; aClose: string;
};

export const SCHEDULE: Record<'long' | 'short', DaySchedule> = {
  long:  { mOpen: '10:30', mClose: '14:00', aOpen: '16:00', aClose: '20:30' },
  short: { mOpen: '10:00', mClose: '14:00', aOpen: '15:00', aClose: '19:00' },
};

export const LAST_ENTRY_MIN = 15;

// UI copy — short labels only. Voice copy lives in config/ap_persona.md.
export const UI_COPY: Record<Language, {
  talkButton:     string;
  talkButtonHeld: string;
  talkButtonTouch: string;
  talkButtonTouchHeld: string;
  preparing:      string;
  listening:      string;
  thinking:       string;
  speaking:       string;
  error:          string;
  scanQr:         string;
  fallbackTitle:  string;
  fallbackText:   string;
  capped:         string;
  offline:        string;
  statusOpen:     string;
  statusLastCall: string;
  statusSiesta:   (opensAt: string) => string;
  statusClosed:   (opensAt: string) => string;
  chips: readonly [string, string, string, string, string, string];
}> = {
  es: {
    talkButton:     'Mantén para hablar',
    talkButtonHeld: 'Suelta al terminar',
    talkButtonTouch: 'Toca para hablar',
    talkButtonTouchHeld: 'Toca al terminar',
    preparing:      'Preparando…',
    listening:      'Escuchando…',
    thinking:       'Pensando…',
    speaking:       'Apa habla…',
    error:          'No puedo escuchar',
    scanQr:         'Escanea para más',
    fallbackTitle:  'Apa perdió la conexión',
    fallbackText:   'Puedes entrar a CGGallery o escanear el QR mientras vuelve la voz.',
    capped:         'Vuelve en un rato 🐧',
    offline:        'Sin conexión',
    statusOpen:     'Abierto ahora',
    statusLastCall: 'Última entrada — 15 min',
    statusSiesta:   (t) => `Siesta · Abrimos a las ${t}`,
    statusClosed:   (t) => `Cerrado · Abrimos a las ${t}`,
    chips: ['👨‍👩‍👧 Somos familia', '❤️ En pareja', '📸 Quiero fotos', '🎁 Busco regalo', '💶 ¿Cuánto cuesta?', '🐧 ¿Qué es esto?'],
  },
  en: {
    talkButton:     'Hold to talk',
    talkButtonHeld: 'Release when done',
    talkButtonTouch: 'Tap to talk',
    talkButtonTouchHeld: 'Tap when done',
    preparing:      'Preparing…',
    listening:      'Listening…',
    thinking:       'Thinking…',
    speaking:       'Apa is speaking…',
    error:          "I can't hear",
    scanQr:         'Scan for more',
    fallbackTitle:  'Apa lost connection',
    fallbackText:   'You can enter CGGallery or scan the QR while the voice comes back.',
    capped:         'Come back in a bit 🐧',
    offline:        'No connection',
    statusOpen:     'Open now',
    statusLastCall: 'Last entry — 15 min',
    statusSiesta:   (t) => `Lunch break · Opens at ${t}`,
    statusClosed:   (t) => `Closed · Opens at ${t}`,
    chips: ['👨‍👩‍👧 Family visit', '❤️ For a couple', '📸 Photography', '🎁 Looking for gift', '💶 How much?', '🐧 What is this?'],
  },
  ru: {
    talkButton:     'Удерживай, чтобы говорить',
    talkButtonHeld: 'Отпусти, когда закончишь',
    talkButtonTouch: 'Нажми, чтобы говорить',
    talkButtonTouchHeld: 'Нажми, когда закончишь',
    preparing:      'Готовлюсь…',
    listening:      'Слушаю…',
    thinking:       'Думаю…',
    speaking:       'Апа говорит…',
    error:          'Не слышу',
    scanQr:         'Сканируй для информации',
    fallbackTitle:  'Апа потерял связь',
    fallbackText:   'Можно зайти в CGGallery или сканировать QR, пока голос возвращается.',
    capped:         'Заходи позже 🐧',
    offline:        'Нет соединения',
    statusOpen:     'Открыто',
    statusLastCall: 'Последний вход — 15 мин',
    statusSiesta:   (t) => `Обед · Откроем в ${t}`,
    statusClosed:   (t) => `Закрыто · Откроем в ${t}`,
    chips: ['👨‍👩‍👧 Семья', '❤️ Пара', '📸 Хочу фото', '🎁 Ищу подарок', '💶 Сколько стоит?', '🐧 Что это?'],
  },
  ca: {
    talkButton:     'Mantén per parlar',
    talkButtonHeld: 'Deixa anar en acabar',
    talkButtonTouch: 'Toca per parlar',
    talkButtonTouchHeld: 'Toca en acabar',
    preparing:      'Preparant…',
    listening:      'Escoltant…',
    thinking:       'Pensant…',
    speaking:       "L'Apa parla…",
    error:          'No et puc sentir',
    scanQr:         'Escaneja per saber-ne més',
    fallbackTitle:  "L'Apa ha perdut la connexió",
    fallbackText:   'Pots entrar a CGGallery o escanejar el QR mentre torna la veu.',
    capped:         'Torna aviat 🐧',
    offline:        'Sense connexió',
    statusOpen:     'Obert ara',
    statusLastCall: 'Última entrada — 15 min',
    statusSiesta:   (t) => `Dinar · Obrim a les ${t}`,
    statusClosed:   (t) => `Tancat · Obrim a les ${t}`,
    chips: ["👨‍👩‍👧 Som família", '❤️ En parella', '📸 Vull fotos', '🎁 Busco regal', '💶 Quant costa?', '🐧 Què és això?'],
  },
  fr: {
    talkButton:     'Maintiens pour parler',
    talkButtonHeld: 'Relâche quand tu as fini',
    talkButtonTouch: 'Touche pour parler',
    talkButtonTouchHeld: 'Touche quand tu as fini',
    preparing:      'Préparation…',
    listening:      'J’écoute…',
    thinking:       'Je réfléchis…',
    speaking:       'Apa parle…',
    error:          'Je n’entends pas',
    scanQr:         'Scanne pour en savoir plus',
    fallbackTitle:  'Apa a perdu la connexion',
    fallbackText:   'Tu peux entrer à CGGallery ou scanner le QR pendant que la voix revient.',
    capped:         'Reviens dans un instant 🐧',
    offline:        'Pas de connexion',
    statusOpen:     'Ouvert maintenant',
    statusLastCall: 'Dernière entrée — 15 min',
    statusSiesta:   (t) => `Pause · Ouverture à ${t}`,
    statusClosed:   (t) => `Fermé · Ouverture à ${t}`,
    chips: ['👨‍👩‍👧 En famille', '❤️ En couple', '📸 Je veux des photos', '🎁 Je cherche un cadeau', '💶 Combien ça coûte ?', '🐧 C’est quoi ?'],
  },
  de: {
    talkButton:     'Zum Sprechen halten',
    talkButtonHeld: 'Loslassen, wenn du fertig bist',
    talkButtonTouch: 'Zum Sprechen tippen',
    talkButtonTouchHeld: 'Zum Beenden tippen',
    preparing:      'Wird vorbereitet…',
    listening:      'Ich höre zu…',
    thinking:       'Ich denke nach…',
    speaking:       'Apa spricht…',
    error:          'Ich höre dich nicht',
    scanQr:         'Scannen für mehr Infos',
    fallbackTitle:  'Apa hat die Verbindung verloren',
    fallbackText:   'Du kannst die CGGallery betreten oder den QR-Code scannen, bis die Stimme zurück ist.',
    capped:         'Versuch es gleich noch einmal 🐧',
    offline:        'Keine Verbindung',
    statusOpen:     'Jetzt geöffnet',
    statusLastCall: 'Letzter Einlass – 15 Min.',
    statusSiesta:   (t) => `Pause · Geöffnet ab ${t} Uhr`,
    statusClosed:   (t) => `Geschlossen · Geöffnet ab ${t} Uhr`,
    chips: ['👨‍👩‍👧 Familie', '❤️ Als Paar', '📸 Fotos', '🎁 Geschenk gesucht', '💶 Wie viel kostet es?', '🐧 Was ist das?'],
  },
  uk: {
    talkButton:     'Утримуй, щоб говорити',
    talkButtonHeld: 'Відпусти, коли закінчиш',
    talkButtonTouch: 'Натисни, щоб говорити',
    talkButtonTouchHeld: 'Натисни, коли закінчиш',
    preparing:      'Готуюся…',
    listening:      'Слухаю…',
    thinking:       'Думаю…',
    speaking:       'Апа говорить…',
    error:          'Не чую тебе',
    scanQr:         'Скануй, щоб дізнатися більше',
    fallbackTitle:  'Апа втратив зв’язок',
    fallbackText:   'Можна зайти до CGGallery або відсканувати QR-код, поки повертається голос.',
    capped:         'Спробуй трохи пізніше 🐧',
    offline:        'Немає з’єднання',
    statusOpen:     'Зараз відкрито',
    statusLastCall: 'Останній вхід – за 15 хв',
    statusSiesta:   (t) => `Перерва · Відкриємо о ${t}`,
    statusClosed:   (t) => `Зачинено · Відкриємо о ${t}`,
    chips: ['👨‍👩‍👧 Ми сім’я', '❤️ Для пари', '📸 Хочу фото', '🎁 Шукаю подарунок', '💶 Скільки коштує?', '🐧 Що це?'],
  },
  sr: {
    talkButton:     'Drži za razgovor',
    talkButtonHeld: 'Pusti kada završiš',
    talkButtonTouch: 'Dodirni za razgovor',
    talkButtonTouchHeld: 'Dodirni kada završiš',
    preparing:      'Pripremam se…',
    listening:      'Slušam…',
    thinking:       'Razmišljam…',
    speaking:       'Apa govori…',
    error:          'Ne čujem te',
    scanQr:         'Skeniraj za više informacija',
    fallbackTitle:  'Apa je izgubio vezu',
    fallbackText:   'Možeš da uđeš u CGGallery ili skeniraš QR kod dok se glas ne vrati.',
    capped:         'Pokušaj ponovo uskoro 🐧',
    offline:        'Nema veze',
    statusOpen:     'Sada otvoreno',
    statusLastCall: 'Poslednji ulaz – 15 min',
    statusSiesta:   (t) => `Pauza · Otvaramo u ${t}`,
    statusClosed:   (t) => `Zatvoreno · Otvaramo u ${t}`,
    chips: ['👨‍👩‍👧 Porodica', '❤️ Za par', '📸 Želim fotografije', '🎁 Tražim poklon', '💶 Koliko košta?', '🐧 Šta je ovo?'],
  },
  it: {
    talkButton:     'Tieni premuto per parlare',
    talkButtonHeld: 'Rilascia quando hai finito',
    talkButtonTouch: 'Tocca per parlare',
    talkButtonTouchHeld: 'Tocca quando hai finito',
    preparing:      'Preparazione…',
    listening:      'Ti ascolto…',
    thinking:       'Sto pensando…',
    speaking:       'Apa parla…',
    error:          'Non ti sento',
    scanQr:         'Scansiona per saperne di più',
    fallbackTitle:  'Apa ha perso la connessione',
    fallbackText:   'Puoi entrare nella CGGallery o scansionare il QR mentre torna la voce.',
    capped:         'Riprova tra poco 🐧',
    offline:        'Nessuna connessione',
    statusOpen:     'Aperto ora',
    statusLastCall: 'Ultimo ingresso – 15 min',
    statusSiesta:   (t) => `Pausa · Riapriamo alle ${t}`,
    statusClosed:   (t) => `Chiuso · Riapriamo alle ${t}`,
    chips: ['👨‍👩‍👧 In famiglia', '❤️ In coppia', '📸 Voglio fare foto', '🎁 Cerco un regalo', '💶 Quanto costa?', '🐧 Che cos’è?'],
  },
  pl: {
    talkButton:     'Przytrzymaj, aby mówić',
    talkButtonHeld: 'Puść, gdy skończysz',
    talkButtonTouch: 'Dotknij, aby mówić',
    talkButtonTouchHeld: 'Dotknij, gdy skończysz',
    preparing:      'Przygotowuję się…',
    listening:      'Słucham…',
    thinking:       'Myślę…',
    speaking:       'Apa mówi…',
    error:          'Nie słyszę cię',
    scanQr:         'Zeskanuj, aby dowiedzieć się więcej',
    fallbackTitle:  'Apa stracił połączenie',
    fallbackText:   'Możesz wejść do CGGallery lub zeskanować kod QR, aż głos wróci.',
    capped:         'Spróbuj ponownie za chwilę 🐧',
    offline:        'Brak połączenia',
    statusOpen:     'Teraz otwarte',
    statusLastCall: 'Ostatnie wejście – 15 min',
    statusSiesta:   (t) => `Przerwa · Otwieramy o ${t}`,
    statusClosed:   (t) => `Zamknięte · Otwieramy o ${t}`,
    chips: ['👨‍👩‍👧 Rodzina', '❤️ Dla pary', '📸 Chcę zdjęcia', '🎁 Szukam prezentu', '💶 Ile to kosztuje?', '🐧 Co to jest?'],
  },
};
