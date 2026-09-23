import type { Language } from './providers/VoiceProvider';

const LANGUAGE_NAME: Record<Language, string> = {
  es: 'Spanish',
  en: 'English',
  ru: 'Russian',
  ca: 'Catalan',
  fr: 'French',
  de: 'German',
  uk: 'Ukrainian',
  sr: 'Serbian',
  it: 'Italian',
  pl: 'Polish',
};

const LANGUAGE_HINT: Record<Language, string> = {
  es: 'Responde en espanol de Espana.',
  en: 'Respond in English.',
  ru: 'Отвечай по-русски.',
  ca: 'Respon en catala.',
  fr: 'Reponds en francais.',
  de: 'Antworte auf Deutsch.',
  uk: 'Відповідай українською.',
  sr: 'Odgovaraj na srpskom. Koristi latinicu osim ako posetilac koristi cirilicu.',
  it: 'Rispondi in italiano.',
  pl: 'Odpowiadaj po polsku.',
};

export function activeLanguageInstruction(lang: Language): string {
  return [
    '## Active kiosk language',
    `The selected kiosk language is ${lang.toUpperCase()} (${LANGUAGE_NAME[lang]}), but this is NOT a language lock.`,
    `Use ${lang.toUpperCase()} only as fallback when the current visitor speech/transcript is missing, noisy, empty, or ambiguous.`,
    `Fallback wording: ${LANGUAGE_HINT[lang]}`,
    'Choose the reply language in this strict order: current visitor audio/transcript for this turn, then recent conversation context, then the selected kiosk language only as a fallback.',
    'Distinguish Russian, Ukrainian, Serbian, and Polish carefully. Never treat every Cyrillic or Slavic-sounding utterance as Russian.',
    'Do not wait for a second visitor turn before switching to the language heard in the current turn.',
    'If the transcript is short, noisy, empty, or ambiguous, keep the selected kiosk language.',
    'Never answer in a different supported language when the current visitor speech is clearly in another one.',
  ].join('\n');
}

export function lockedLanguageInstruction(lang: Language): string {
  return [
    '## Explicit visitor language choice',
    `The visitor explicitly selected ${lang.toUpperCase()} (${LANGUAGE_NAME[lang]}) in the kiosk UI.`,
    LANGUAGE_HINT[lang],
    'Reply in this language for the whole turn, even if speech recognition is noisy or partial.',
    'Only switch away from this language if the visitor explicitly asks you to change language.',
  ].join('\n');
}

export function detectLanguage(text: string, fallback: Language): Language {
  return detectLanguageDetailed(text, fallback).language;
}

export function detectLanguageDetailed(
  text: string,
  fallback: Language,
): { language: Language; confidence: 'strong' | 'fallback' } {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFC');

  if (!normalized) return { language: fallback, confidence: 'fallback' };
  if (/[іїєґ]/i.test(normalized)) return { language: 'uk', confidence: 'strong' };
  if (/[јљњћђџ]/i.test(normalized)) return { language: 'sr', confidence: 'strong' };
  if (/[ыэёъ]/i.test(normalized)) return { language: 'ru', confidence: 'strong' };
  if (/[ąćęłńśźż]/i.test(normalized)) return { language: 'pl', confidence: 'strong' };

  const score = (pattern: RegExp): number => [...normalized.matchAll(pattern)].length;

  const scores: Array<[Language, number]> = [
    ['ru', score(/(привет|спасибо|пожалуйста|сколько|стоит|билет|пингвин|можно|расскажи|зал|где|дети|семья|хорошо)/gi) + score(/\b(privet|zdravstvuyte|spasibo|pozhaluysta|skolko|stoit|bilet|pingvin|mozhno|skazhite|rasskazhi|zal|gde|deti|semya|horosho)\b/gi)],
    ['uk', score(/(привіт|дякую|будь ласка|скільки|коштує|квиток|пінгвін|можна|розкажи|зала|зал|де|діти|сім'я|сім’я|добре|так|ні)/gi) + score(/\b(pryvit|vitayu|diakuiu|dyakuyu|skilky|koshtuye|kvytok|pinhvin|mozhna|rozkazhy|de|dity|simya|dobre)\b/gi)],
    ['sr', score(/(здраво|хвала|молим|колико|кошта|карта|улазница|пингвин|може|испричај|сала|где|шта|деца|породица|добро)/gi) + score(/\b(zdravo|hvala|molim|koliko|kosta|košta|karta|ulaznica|pingvin|moze|može|ispricaj|ispričaj|sala|gde|sta|šta|deca|porodica|dobro)\b/gi) + score(/[čćšđž]/gi)],
    ['en', score(/\b(hello|hi|thanks|thank you|how much|ticket|tickets|price|family|photo|gift|what|where|when|please|want|with|for|open|closed|children|kids)\b/gi)],
    ['es', score(/\b(hola|gracias|cuanto|cuánto|entrada|precio|familia|foto|regalo|que|qué|donde|dónde|quiero|puedo|con|para|horario|abierto|cerrado|niños|ninos)\b/gi)],
    ['ca', score(/\b(hola|gracies|gràcies|quant|costa|tiquet|entrada|família|familia|foto|regal|què|aixo|això|vull|som|amb|obert|tancat|nens|nen)\b/gi)],
    ['fr', score(/\b(bonjour|salut|merci|combien|billet|billets|ticket|tickets|prix|famille|photo|cadeau|quoi|qu'est-ce|ou|où|quand|s'il vous plait|svp|veux|voudrais|avec|pour|ouvert|ferme|fermé|enfants)\b/gi)],
    ['de', score(/\b(hallo|guten tag|danke|bitte|wie viel|eintritt|karte|karten|preis|familie|foto|geschenk|was|wo|wann|möchte|will|mit|für|geöffnet|geschlossen|kinder|pinguin|ausstellung)\b/gi)],
    ['it', score(/\b(ciao|buongiorno|grazie|quanto|costa|biglietto|biglietti|prezzo|famiglia|foto|regalo|cosa|dove|quando|vorrei|voglio|posso|aperto|chiuso|bambini|pinguino|mostra)\b/gi)],
    ['pl', score(/\b(cześć|czesc|dzień dobry|dzien dobry|dziękuję|dziekuje|proszę|prosze|ile|kosztuje|bilet|bilety|cena|rodzina|zdjęcie|zdjecie|prezent|co|gdzie|kiedy|chcę|chce|mogę|moge|otwarte|zamknięte|zamkniete|dzieci|pingwin|wystawa)\b/gi)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0) return { language: fallback, confidence: 'fallback' };
  if (scores[0][1] === scores[1][1]) return { language: fallback, confidence: 'fallback' };
  return { language: scores[0][0], confidence: 'strong' };
}
