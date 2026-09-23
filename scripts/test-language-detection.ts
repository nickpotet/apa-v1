import assert from 'node:assert/strict';
import type { Language } from '../kiosk/src/voice/providers/VoiceProvider.ts';
import { detectLanguageDetailed } from '../kiosk/src/voice/languageDetection.ts';

const cases: Array<[Language, string]> = [
  ['es', 'Hola, ¿cuánto cuesta la entrada para niños?'],
  ['en', 'Hello, how much are the tickets for a family?'],
  ['ru', 'Привет, расскажи про зал и пингвинов.'],
  ['ca', 'Hola, quant costa l’entrada per als nens?'],
  ['fr', 'Bonjour, combien coûte le billet pour une famille ?'],
  ['de', 'Hallo, wie viel kostet der Eintritt für Kinder?'],
  ['uk', 'Привіт, розкажи про зал і пінгвінів.'],
  ['sr', 'Zdravo, koliko košta karta za decu?'],
  ['sr', 'Здраво, колико кошта карта за децу?'],
  ['it', 'Ciao, quanto costa il biglietto per i bambini?'],
  ['pl', 'Cześć, ile kosztuje bilet dla dzieci?'],
];

for (const [expected, text] of cases) {
  const result = detectLanguageDetailed(text, 'es');
  assert.equal(result.language, expected, `${JSON.stringify(text)} detected as ${result.language}`);
  assert.equal(result.confidence, 'strong', `${JSON.stringify(text)} was not a strong match`);
}

for (const text of ['si', 'da', 'ok', 'no']) {
  const result = detectLanguageDetailed(text, 'de');
  assert.deepEqual(result, { language: 'de', confidence: 'fallback' });
}

console.log(`Language detection passed: ${cases.length} positive cases and 4 ambiguity cases.`);
