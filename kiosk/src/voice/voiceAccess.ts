import type { VoiceAccess } from './providerFactory';
import { normalizeProviderKind } from './providerFactory';

const TOKEN_REFRESH_WINDOW_MS = 30_000;

export function isVoiceAccessFresh(access: VoiceAccess | null): boolean {
  if (!access) return false;
  return access.expiresAt === null || access.expiresAt > Date.now() + TOKEN_REFRESH_WINDOW_MS;
}

export async function fetchVoiceAccess(isPagesDemo: boolean, onCapped: () => void): Promise<VoiceAccess | null> {
  if (isPagesDemo) {
    return { token: 'demo-token', provider: 'demo', expiresAt: null };
  }

  const response = await fetch('/api/token', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`token request failed: ${response.status}`);
  }

  const data = await response.json() as {
    token?: string;
    capped?: boolean;
    provider?: unknown;
    expiresAt?: string;
  };

  if (data.capped) {
    onCapped();
    return null;
  }

  if (!data.token) {
    throw new Error('token missing from /api/token response');
  }

  return {
    token: data.token,
    provider: normalizeProviderKind(data.provider),
    expiresAt: data.expiresAt ? Date.parse(data.expiresAt) : null,
  };
}
