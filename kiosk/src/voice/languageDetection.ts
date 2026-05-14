import type { Language } from './providers/VoiceProvider';

export function detectLanguage(text: string): Language {
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/\b(el|la|els|les|un|una|de|del|al|i|que|és|per|amb)\b/i.test(text)) return 'ca';
  if (!/\b(el|la|los|las|de|en|y|es|que|por|un|una)\b/i.test(text)) return 'en';
  return 'es';
}
