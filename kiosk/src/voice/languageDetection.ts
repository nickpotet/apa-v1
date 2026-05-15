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
    'Keep this language unless the visitor clearly speaks another supported language.',
    'If the transcript is short, noisy, empty, or ambiguous, keep the selected kiosk language.',
  ].join('\n');
}

export function detectLanguage(text: string, fallback: Language): Language {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFC');

  if (!normalized) return fallback;
  if (/[Ѐ-ӿ]/.test(normalized)) return 'ru';

  if (/\b(privet|spasibo|skolko|stoim|bilet|pingvin|pingviny|da|net|khorosho|horosho)\b/i.test(normalized)) {
    return 'ru';
  }

  if (/\b(hello|hi|thanks|thank you|how much|ticket|tickets|price|family|photo|gift|what is this)\b/i.test(normalized)) {
    return 'en';
  }

  if (/\b(hola|gracias|cuanto|cuánto|entrada|precio|familia|foto|regalo|que es|qué es|donde|dónde)\b/i.test(normalized)) {
    return 'es';
  }

  if (/\b(hola|gracies|gràcies|quant|costa|tiquet|entrada|familia|família|foto|regal|què|aixo|això|vull|som|amb)\b/i.test(normalized)) {
    return 'ca';
  }

  return fallback;
}
