import type { VoiceProvider } from './providers/VoiceProvider';
import { DemoVoiceProvider } from './providers/demo';
import { GeminiVoiceProvider } from './providers/gemini';
import { OpenAIRealtimeProvider } from './providers/openai';

export type ProviderKind = 'gemini' | 'openai' | 'demo';

export type VoiceAccess = {
  token: string;
  provider: ProviderKind;
  expiresAt: number | null;
};

export function normalizeProviderKind(value: unknown): ProviderKind {
  return value === 'openai' || value === 'demo' || value === 'gemini' ? value : 'gemini';
}

export function createProvider(kind: ProviderKind): VoiceProvider {
  if (kind === 'demo') return new DemoVoiceProvider();
  return kind === 'openai' ? new OpenAIRealtimeProvider() : new GeminiVoiceProvider();
}
