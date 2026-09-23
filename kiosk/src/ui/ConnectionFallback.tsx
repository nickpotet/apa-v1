import { QRCodeSVG } from 'qrcode.react';
import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';
import { QR_URL, UI_COPY } from '../config/venueConfig';

interface Props {
  lang: Language;
  kioskState: KioskState;
}

export function ConnectionFallback({ lang, kioskState }: Props) {
  if (kioskState !== 'offline' && kioskState !== 'capped') return null;

  const copy = UI_COPY[lang];

  return (
    <div className="pointer-events-none absolute inset-x-5 bottom-40 z-20 mx-auto flex max-w-sm items-center gap-4 rounded-3xl border border-white/18 bg-[#061225]/78 p-4 shadow-[0_12px_42px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="shrink-0 rounded-2xl bg-white p-2 shadow-md">
        <QRCodeSVG value={QR_URL} size={72} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black leading-tight text-white">{copy.fallbackTitle}</p>
        <p className="mt-1 text-xs leading-snug text-white/78">{copy.fallbackText}</p>
      </div>
    </div>
  );
}
