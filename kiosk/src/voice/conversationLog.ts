export function logConversation(lang: string, trigger: string, startedAt: number, model: string): void {
  const duration_s = Math.round((Date.now() - startedAt) / 1000);
  if (duration_s < 2) return;

  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang, trigger, duration_s, model }),
  }).catch(() => {});
}
