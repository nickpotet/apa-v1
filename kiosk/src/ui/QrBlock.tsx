import { QRCodeSVG } from 'qrcode.react';
import type { Language } from '../voice/providers/VoiceProvider';
import { QR_URL, UI_COPY } from '../config/venueConfig';

interface Props { lang: Language }

export function QrBlock({ lang }: Props) {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="rounded-xl bg-white p-2 shadow-md">
        <QRCodeSVG value={QR_URL} size={64} />
      </div>
      <span className="text-sm text-white/40">{UI_COPY[lang].scanQr}</span>
    </div>
  );
}
