/// <reference types="@cloudflare/workers-types" />

import { GoogleGenAI, Modality } from '@google/genai';

type Language = 'es' | 'en' | 'ru' | 'ca' | 'fr' | 'de' | 'uk' | 'sr' | 'it' | 'pl';

interface Env {
  GEMINI_API_KEY?: string;
  GUIDE_TRANSCRIBE_MODEL?: string;
  GUIDE_TURN_MODEL?: string;
  GUIDE_TTS_MODEL?: string;
  GUIDE_TTS_MODE?: string;
}

type GuideTurnRequest = {
  audioPcmBase64?: string;
  sampleRate?: number;
  initialLanguage?: Language;
  languageLock?: Language | null;
  systemPrompt?: string;
};

const LANGUAGES: Language[] = ['es', 'en', 'ru', 'ca', 'fr', 'de', 'uk', 'sr', 'it', 'pl'];
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
const LANGUAGE_CODE: Record<Language, string> = {
  es: 'es-ES',
  en: 'en-US',
  ru: 'ru-RU',
  ca: 'ca-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  uk: 'uk-UA',
  sr: 'sr-RS',
  it: 'it-IT',
  pl: 'pl-PL',
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

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...init?.headers,
    },
  });
}

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGES.includes(value as Language);
}

function byteLength(base64: string): number {
  try {
    return atob(base64).length;
  } catch {
    return 0;
  }
}

function inspectPcm16Base64(base64: string): { peak: number; samples: number } {
  const binary = atob(base64);
  const samples = Math.floor(binary.length / 2);
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let sample = (hi << 8) | lo;
    if (sample & 0x8000) sample -= 0x10000;
    const abs = Math.abs(sample) / 0x7fff;
    if (abs > peak) peak = abs;
  }
  return {
    peak: Number(peak.toFixed(4)),
    samples,
  };
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function pcm16Base64ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const binary = atob(pcmBase64);
  const pcm = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);

  const headerSize = 44;
  const out = new Uint8Array(headerSize + pcm.length);
  const byteRate = sampleRate * 2;
  const blockAlign = 2;

  writeAscii(out, 0, 'RIFF');
  writeUint32LE(out, 4, 36 + pcm.length);
  writeAscii(out, 8, 'WAVE');
  writeAscii(out, 12, 'fmt ');
  writeUint32LE(out, 16, 16);
  writeUint16LE(out, 20, 1);
  writeUint16LE(out, 22, 1);
  writeUint32LE(out, 24, sampleRate);
  writeUint32LE(out, 28, byteRate);
  writeUint16LE(out, 32, blockAlign);
  writeUint16LE(out, 34, 16);
  writeAscii(out, 36, 'data');
  writeUint32LE(out, 40, pcm.length);
  out.set(pcm, headerSize);

  return bytesToBase64(out);
}

function cleanJsonText(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(cleanJsonText(text));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function score(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function detectLanguage(text: string, fallback: Language): { language: Language; confidence: 'strong' | 'fallback' } {
  const normalized = text.trim().toLowerCase().normalize('NFC');
  if (!normalized) return { language: fallback, confidence: 'fallback' };
  if (/[іїєґ]/i.test(normalized)) return { language: 'uk', confidence: 'strong' };
  if (/[јљњћђџ]/i.test(normalized)) return { language: 'sr', confidence: 'strong' };
  if (/[ыэёъ]/i.test(normalized)) return { language: 'ru', confidence: 'strong' };
  if (/[ąćęłńśźż]/i.test(normalized)) return { language: 'pl', confidence: 'strong' };

  const scores: Array<[Language, number]> = [
    ['ru', score(normalized, /(привет|спасибо|пожалуйста|сколько|стоит|билет|пингвин|можно|расскажи|зал|где|дети|семья|хорошо)/gi) + score(normalized, /\b(privet|zdravstvuyte|spasibo|pozhaluysta|skolko|stoit|bilet|pingvin|mozhno|skazhite|rasskazhi|zal|gde|deti|semya|horosho)\b/gi)],
    ['uk', score(normalized, /(привіт|дякую|будь ласка|скільки|коштує|квиток|пінгвін|можна|розкажи|зала|зал|де|діти|сім'я|сім’я|добре|так|ні)/gi) + score(normalized, /\b(pryvit|vitayu|diakuiu|dyakuyu|skilky|koshtuye|kvytok|pinhvin|mozhna|rozkazhy|de|dity|simya|dobre)\b/gi)],
    ['sr', score(normalized, /(здраво|хвала|молим|колико|кошта|карта|улазница|пингвин|може|испричај|сала|где|шта|деца|породица|добро)/gi) + score(normalized, /\b(zdravo|hvala|molim|koliko|kosta|košta|karta|ulaznica|pingvin|moze|može|ispricaj|ispričaj|sala|gde|sta|šta|deca|porodica|dobro)\b/gi) + score(normalized, /[čćšđž]/gi)],
    ['en', score(normalized, /\b(hello|hi|thanks|thank you|how much|ticket|tickets|price|family|photo|gift|what|where|when|please|want|with|for|open|closed|children|kids)\b/gi)],
    ['es', score(normalized, /\b(hola|gracias|cuanto|cuánto|entrada|precio|familia|foto|regalo|que|qué|donde|dónde|quiero|puedo|con|para|horario|abierto|cerrado|niños|ninos)\b/gi)],
    ['ca', score(normalized, /\b(hola|gracies|gràcies|quant|costa|tiquet|entrada|família|familia|foto|regal|què|aixo|això|vull|som|amb|obert|tancat|nens|nen)\b/gi)],
    ['fr', score(normalized, /\b(bonjour|salut|merci|combien|billet|billets|ticket|tickets|prix|famille|photo|cadeau|quoi|qu'est-ce|ou|où|quand|s'il vous plait|svp|veux|voudrais|avec|pour|ouvert|ferme|fermé|enfants|animaux)\b/gi)],
    ['de', score(normalized, /\b(hallo|guten tag|danke|bitte|wie viel|eintritt|karte|karten|preis|familie|foto|geschenk|was|wo|wann|möchte|will|mit|für|geöffnet|geschlossen|kinder|pinguin|ausstellung|tiere)\b/gi)],
    ['it', score(normalized, /\b(ciao|buongiorno|grazie|quanto|costa|biglietto|biglietti|prezzo|famiglia|foto|regalo|cosa|dove|quando|vorrei|voglio|posso|aperto|chiuso|bambini|pinguino|mostra|animali)\b/gi)],
    ['pl', score(normalized, /\b(cześć|czesc|dzień dobry|dzien dobry|dziękuję|dziekuje|proszę|prosze|ile|kosztuje|bilet|bilety|cena|rodzina|zdjęcie|zdjecie|prezent|co|gdzie|kiedy|chcę|chce|mogę|moge|otwarte|zamknięte|zamkniete|dzieci|pingwin|wystawa|zwierzęta|zwierzeta)\b/gi)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0 || scores[0][1] === scores[1][1]) return { language: fallback, confidence: 'fallback' };
  return { language: scores[0][0], confidence: 'strong' };
}

function languageGuard(language: Language): string {
  return [
    '## Deterministic response language',
    `The visitor language for this turn is ${language.toUpperCase()} (${LANGUAGE_NAME[language]}).`,
    LANGUAGE_HINT[language],
    'Reply only in this language. Do not answer in Spanish unless the selected language is Spanish.',
    'Use previous dialogue only for meaning and topic continuity, never to override the output language.',
  ].join('\n');
}

function firstInlineAudio(response: { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>; data?: string }): { data: string; mimeType: string } | null {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
        return { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
      }
    }
  }
  if (response.data) return { data: response.data, mimeType: 'audio/L16;codec=pcm;rate=24000' };
  return null;
}

async function transcribe(ai: GoogleGenAI, model: string, audioPcmBase64: string, sampleRate: number): Promise<{ text: string; modelLanguage: Language | null }> {
  const audioWavBase64 = pcm16Base64ToWavBase64(audioPcmBase64, sampleRate);
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        {
          text: [
            'Transcribe the visitor speech exactly.',
            'Return only JSON: {"text":"...","language":"es|en|ru|ca|fr|de|uk|sr|it|pl|null"}.',
            'If there is no intelligible speech, use empty text and null language.',
          ].join('\n'),
        },
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: audioWavBase64,
          },
        },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 220,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });
  const parsed = parseJsonObject(response.text ?? '');
  const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
  const modelLanguage = isLanguage(parsed.language) ? parsed.language : null;
  return { text, modelLanguage };
}

async function generateAnswer(ai: GoogleGenAI, model: string, systemPrompt: string, transcript: string, language: Language): Promise<string> {
  const guard = languageGuard(language);
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{
        text: [
          `Visitor transcript: ${transcript}`,
          '',
          'Answer now as Apa.',
          'Aim for 4-6 sentences with one vivid detail, then a short question to continue. Stay warm, never lecture.',
          'If the transcript is silence/noise/cut off, ask the visitor to repeat instead of inventing a topic.',
        ].join('\n'),
      }],
    }],
    config: {
      systemInstruction: {
        parts: [{ text: `${guard}\n\n${systemPrompt}\n\n${guard}` }],
      },
      temperature: 0.45,
      maxOutputTokens: 600,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });
  return (response.text ?? '').trim();
}

async function generateTranscriptAndAnswer(
  ai: GoogleGenAI,
  model: string,
  systemPrompt: string,
  audioPcmBase64: string,
  sampleRate: number,
  initialLanguage: Language,
  languageLock: Language | null,
): Promise<{ transcript: string; language: Language; languageSource: string; text: string }> {
  const audioWavBase64 = pcm16Base64ToWavBase64(audioPcmBase64, sampleRate);
  const fallbackGuard = languageLock
    ? languageGuard(languageLock)
    : [
        '## Response language',
        'Detect the visitor language only from the current audio/transcript.',
        `Use ${initialLanguage.toUpperCase()} only if the current audio is unintelligible or ambiguous.`,
        'Return the answer in the detected visitor language.',
        'Never answer in Spanish when the current visitor clearly speaks another supported language.',
        'Distinguish Russian, Ukrainian, Serbian, and Polish carefully. Cyrillic does not automatically mean Russian.',
      ].join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        {
          text: [
            'The visitor asks in this audio.',
            'First transcribe the visitor exactly. Then answer as Apa.',
            'Return JSON only with this shape:',
            '{"transcript":"exact visitor transcript or empty string","language":"es|en|ru|ca|fr|de|uk|sr|it|pl","answer":"Apa answer"}',
            'Make the answer richer: 4-6 sentences with one vivid detail, then a short question. Stay warm, never lecture.',
            'If the audio is silence/noise/cut off, set transcript empty and answer with a brief repeat request.',
          ].join('\n'),
        },
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: audioWavBase64,
          },
        },
      ],
    }],
    config: {
      systemInstruction: {
        parts: [{ text: `${fallbackGuard}\n\n${systemPrompt}\n\n${fallbackGuard}` }],
      },
      responseMimeType: 'application/json',
      temperature: 0.35,
      maxOutputTokens: 760,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });

  const parsed = parseJsonObject(response.text ?? '');
  const transcript = typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '';
  const detection = detectLanguage(transcript, initialLanguage);
  const modelLanguage = isLanguage(parsed.language) ? parsed.language : null;
  const language = languageLock ?? modelLanguage ?? detection.language;
  const text = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';

  return {
    transcript,
    language,
    languageSource: languageLock ? 'lock' : modelLanguage ? 'model_audio_json' : detection.confidence,
    text,
  };
}

async function synthesize(ai: GoogleGenAI, model: string, text: string, language: Language): Promise<{ audioPcmBase64: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{ text: `Say this as Apa, a playful young penguin. Speak naturally in ${LANGUAGE_NAME[language]}:\n${text}` }],
    }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        languageCode: LANGUAGE_CODE[language],
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck',
          },
        },
      },
    },
  });

  const audio = firstInlineAudio(response);
  if (!audio) throw new Error('TTS returned no audio');
  return { audioPcmBase64: audio.data, mimeType: audio.mimeType };
}

async function maybeSynthesize(
  ai: GoogleGenAI,
  model: string,
  text: string,
  language: Language,
  mode: string,
): Promise<{ audio: { audioPcmBase64: string; mimeType: string } | null; ttsError: string | null }> {
  if (mode !== 'gemini') {
    return { audio: null, ttsError: 'server_tts_disabled_browser_fallback' };
  }
  try {
    return { audio: await synthesize(ai, model, text, language), ttsError: null };
  } catch (err) {
    return { audio: null, ttsError: err instanceof Error ? err.message : String(err) };
  }
}

function repeatText(language: Language): string {
  const text: Record<Language, string> = {
    es: 'Perdona, no te oi bien. ¿Me lo repites?',
    en: 'Sorry, I did not hear you clearly. Can you repeat that?',
    ru: 'Прости, я не расслышал. Повторишь еще раз?',
    ca: 'Perdona, no t he sentit be. M ho repeteixes?',
    fr: 'Pardon, je n ai pas bien entendu. Tu peux repeter?',
    de: 'Entschuldigung, ich habe dich nicht gut verstanden. Kannst du das wiederholen?',
    uk: 'Вибач, я не розчув. Можеш повторити?',
    sr: 'Izvini, nisam te dobro cuo. Mozes li da ponovis?',
    it: 'Scusa, non ti ho sentito bene. Puoi ripetere?',
    pl: 'Przepraszam, nie usłyszałem cię dobrze. Możesz powtórzyć?',
  };
  return text[language];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
  }

  let body: GuideTurnRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, { status: 400 });
  }

  const audioPcmBase64 = typeof body.audioPcmBase64 === 'string' ? body.audioPcmBase64 : '';
  const audioBytes = byteLength(audioPcmBase64);
  const sampleRate = Number(body.sampleRate ?? 16000);
  const initialLanguage = isLanguage(body.initialLanguage) ? body.initialLanguage : 'es';
  const languageLock = isLanguage(body.languageLock) ? body.languageLock : null;
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '';

  if (!audioPcmBase64 || audioBytes < 1600) {
    return json({ error: 'audio missing or too short' }, { status: 400 });
  }
  if (sampleRate !== 16000 && sampleRate !== 24000) {
    return json({ error: 'unsupported sample rate' }, { status: 400 });
  }
  if (!systemPrompt) {
    return json({ error: 'system prompt missing' }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const transcribeModel = env.GUIDE_TRANSCRIBE_MODEL ?? 'gemini-3.1-flash-lite';
  const turnModel = env.GUIDE_TURN_MODEL ?? 'gemini-3.1-flash-lite';
  const ttsModel = env.GUIDE_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts';
  // Default to server-side Gemini TTS so RU/CA don't fall back to poor/missing
  // browser voices. On any TTS failure the client still falls back to browser
  // speech synthesis, so this is strictly better than the old 'browser' default.
  // Override with GUIDE_TTS_MODE=browser to force the old behavior.
  const ttsMode = env.GUIDE_TTS_MODE ?? 'gemini';
  const startedAt = Date.now();
  const inputStats = inspectPcm16Base64(audioPcmBase64);

  try {
    if (inputStats.peak <= 0.0001) {
      const language = languageLock ?? initialLanguage;
      const text = repeatText(language);
      const { audio, ttsError } = await maybeSynthesize(ai, ttsModel, text, language, ttsMode);
      return json({
        ok: true,
        language,
        languageSource: languageLock ? 'lock' : 'fallback',
        transcript: '',
        text,
        audioPcmBase64: audio?.audioPcmBase64,
        audioMimeType: audio?.mimeType,
        ttsError,
        latencyMs: Date.now() - startedAt,
        inputStats,
        models: { transcribe: null, answer: null, tts: audio ? ttsModel : null },
      });
    }

    const turn = await generateTranscriptAndAnswer(
      ai,
      turnModel,
      systemPrompt,
      audioPcmBase64,
      sampleRate,
      initialLanguage,
      languageLock,
    );
    const language = turn.language;

    if (!turn.transcript) {
      const text = repeatText(language);
      const { audio, ttsError } = await maybeSynthesize(ai, ttsModel, text, language, ttsMode);
      return json({
        ok: true,
        language,
        languageSource: languageLock ? 'lock' : 'fallback',
        transcript: '',
        text,
        audioPcmBase64: audio?.audioPcmBase64,
        audioMimeType: audio?.mimeType,
        ttsError,
        latencyMs: Date.now() - startedAt,
        inputStats,
        models: { transcribe: null, answer: turnModel, tts: audio ? ttsModel : null },
      });
    }

    const text = turn.text;
    if (!text) throw new Error('answer model returned empty text');
    const { audio, ttsError } = await maybeSynthesize(ai, ttsModel, text, language, ttsMode);

    return json({
      ok: true,
      language,
      languageSource: turn.languageSource,
      transcript: turn.transcript,
      text,
      audioPcmBase64: audio?.audioPcmBase64,
      audioMimeType: audio?.mimeType,
      ttsError,
      latencyMs: Date.now() - startedAt,
      inputStats,
      models: { transcribe: null, answer: turnModel, tts: audio ? ttsModel : null },
    });
  } catch (err) {
    console.error('[guide-turn]', err);
    return json({
      error: 'guide turn failed',
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    }, { status: 502 });
  }
};

export const onRequest: PagesFunction<Env> = async () => {
  return json({ error: 'method not allowed' }, { status: 405 });
};
