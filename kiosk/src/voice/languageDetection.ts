import type { Language } from './providers/VoiceProvider';

const LANGUAGE_NAME: Record<Language, string> = {
  es: 'Spanish',
  en: 'English',
  ru: 'Russian',
  ca: 'Catalan',
};

const LANGUAGE_HINT: Record<Language, string> = {
  es: 'Responde en espanol de Espana.',
  en: 'Respond in English.',
  ru: 'Отвечай по-русски.',
  ca: 'Respon en catala.',
};

export function activeLanguageInstruction(lang: Language): string {
  return [
    '## Active kiosk language',
    `The selected kiosk language is ${lang.toUpperCase()} (${LANGUAGE_NAME[lang]}).`,
    LANGUAGE_HINT[lang],
    'Choose the reply language in this order: current visitor audio/transcript for this turn, then recent conversation context, then the selected kiosk language only as a fallback.',
    'If the current visitor speech clearly sounds Russian or contains any Slavic-sounding word, reply in Russian immediately.',
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
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFC');

  if (!normalized) return fallback;
  if (/[Ѐ-ӿ]/.test(normalized)) return 'ru';

  const score = (pattern: RegExp): number => [...normalized.matchAll(pattern)].length;

  const scores: Array<[Language, number]> = [
    ['ru', score(/\b(privet|zdravstvuyte|zdravstvuite|spasibo|pozhaluysta|pojaluysta|skolko|skolka|stoit|bilet|bilety|pingvin|pingviny|mozhno|mojno|skazhite|kakoi|kakaya|kakie|gde|mne|menya|ya|deti|semya|semyi|horosho|khorosho)\b/gi)],
    ['en', score(/\b(hello|hi|thanks|thank you|how much|ticket|tickets|price|family|photo|gift|what|where|when|please|want|with|for|open|closed|children|kids)\b/gi)],
    ['es', score(/\b(hola|gracias|cuanto|cuánto|entrada|precio|familia|foto|regalo|que|qué|donde|dónde|quiero|puedo|con|para|horario|abierto|cerrado|niños|ninos)\b/gi)],
    ['ca', score(/\b(hola|gracies|gràcies|quant|costa|tiquet|entrada|família|familia|foto|regal|què|aixo|això|vull|som|amb|obert|tancat|nens|nen)\b/gi)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0) return fallback;
  if (scores[0][1] === scores[1][1]) return fallback;
  return scores[0][0];
}
