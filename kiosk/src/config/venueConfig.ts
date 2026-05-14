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
  listening:      string;
  thinking:       string;
  speaking:       string;
  error:          string;
  scanQr:         string;
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
    listening:      'Escuchando…',
    thinking:       'Pensando…',
    speaking:       'Apa habla…',
    error:          'No puedo escuchar',
    scanQr:         'Escanea para más',
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
    listening:      'Listening…',
    thinking:       'Thinking…',
    speaking:       'Apa is speaking…',
    error:          "I can't hear",
    scanQr:         'Scan for more',
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
    listening:      'Слушаю…',
    thinking:       'Думаю…',
    speaking:       'Апа говорит…',
    error:          'Не слышу',
    scanQr:         'Сканируй для информации',
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
    listening:      'Escoltant…',
    thinking:       'Pensant…',
    speaking:       "L'Apa parla…",
    error:          'No et puc sentir',
    scanQr:         'Escaneja per saber-ne més',
    capped:         'Torna aviat 🐧',
    offline:        'Sense connexió',
    statusOpen:     'Obert ara',
    statusLastCall: 'Última entrada — 15 min',
    statusSiesta:   (t) => `Dinar · Obrim a les ${t}`,
    statusClosed:   (t) => `Tancat · Obrim a les ${t}`,
    chips: ["👨‍👩‍👧 Som família", '❤️ En parella', '📸 Vull fotos', '🎁 Busco regal', '💶 Quant costa?', '🐧 Què és això?'],
  },
};
